import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, chmod, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  runCycle,
  classifyArtifact,
  formatCompletionProofError,
  formatTimeoutProofError,
  shouldSkipForArtifact,
} from "../../src/engine/run-cycle.ts";
import { expectExactlyOne } from "../helpers.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error("git " + args.join(" ") + ": " + r.stderr);
  return r.stdout;
}

// Workflow with a single nonempty-policy agent step (e.g. review) so the
// empty-diff guard (build/fix only) does not interfere with the contract under
// test. A trailing second step lets us assert the cycle advances on a pass.
function workflowYml(steps: { name: string }[], stepTimeoutMs?: number): string {
  const stepLines = steps
    .map((s) => `      - name: ${s.name}\n        agent: claudecode\n        prompt: prompts/${s.name}.md`)
    .join("\n");
  return [
    "engine:",
    "  max_consecutive_failures: 2",
    "  base_branch: main",
    ...(stepTimeoutMs !== undefined ? [`  step_timeout_ms: ${stepTimeoutMs}`] : []),
    "  commit:",
    "    mode: trunk",
    "    push: false",
    "triage:",
    "  agent: claudecode",
    "  prompt: prompts/triage.md",
    "  max_turns: 10",
    "workflows:",
    "  - name: feature",
    "    max_cycle_attempts: 3",
    "    steps:",
    stepLines,
  ].join("\n") + "\n";
}

async function setupRepo(
  fakeBody: string,
  steps: { name: string }[],
  stepTimeoutMs?: number,
): Promise<{ root: string; bin: string }> {
  const root = await mkdtemp(join(tmpdir(), "cycle-completion-proof-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-completion-proof-bin-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  await mkdir(join(root, ".cycle/prompts"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), workflowYml(steps, stepTimeoutMs), "utf8");
  for (const s of steps) {
    await writeFile(join(root, `.cycle/prompts/${s.name}.md`), "noop", "utf8");
  }
  const fake = join(bin, "claude");
  await writeFile(fake, fakeBody, "utf8");
  await chmod(fake, 0o755);
  return { root, bin };
}

async function cleanup(root: string, bin: string) {
  await rm(root, { recursive: true, force: true });
  await rm(bin, { recursive: true, force: true });
}

function readEvents(log: string): Record<string, unknown>[] {
  return log
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

const SHEBANG = "#!/bin/bash";

// ---------------------------------------------------------------------------
// Unit: classifyArtifact emptiness definition (shared by the contract + skip gate)
// ---------------------------------------------------------------------------

test("classifyArtifact: missing path -> empty (catch branch, fail-closed)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-cp-classify-"));
  try {
    assert.equal(await classifyArtifact(join(root, "nope.md")), "empty");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("classifyArtifact: 0-byte and whitespace-only -> empty; non-whitespace -> nonempty", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-cp-classify-"));
  try {
    await writeFile(join(root, "empty.md"), "", "utf8");
    await writeFile(join(root, "ws.md"), "   \n\t\n", "utf8");
    await writeFile(join(root, "real.md"), "x", "utf8");
    assert.equal(await classifyArtifact(join(root, "empty.md")), "empty");
    assert.equal(await classifyArtifact(join(root, "ws.md")), "empty");
    assert.equal(await classifyArtifact(join(root, "real.md")), "nonempty");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("formatCompletionProofError: stable greppable shape with em-dash, step, and path", () => {
  const out = formatCompletionProofError("review", "/a/b/REVIEW.md");
  assert.equal(out, "review exited 0 but /a/b/REVIEW.md is empty — treating as failure");
  assert.match(out, /is empty — treating as failure/);
});

test("formatTimeoutProofError: timeout wording with exit code, no 'exited 0'", () => {
  const out = formatTimeoutProofError("review", "/a/b/REVIEW.md", 143);
  assert.equal(out, "review timed out (exit 143) and left /a/b/REVIEW.md empty — treating as failure");
  assert.match(out, /timed out \(exit 143\)/);
  assert.match(out, /— treating as failure/);
  assert.doesNotMatch(out, /exited 0/);
});

test("shouldSkipForArtifact: whitespace-only artifact -> skip:false (re-runs on retry)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-cp-skip-"));
  try {
    const dir = join(root, "art");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "SPEC.md"), "   \n", "utf8");
    const r = await shouldSkipForArtifact(dir, "spec");
    assert.equal(r.skip, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Failure path: empty / whitespace artifact under the nonempty policy
// ---------------------------------------------------------------------------

test("completion-proof: review exits 0 with empty stdout -> failed via the contract", async () => {
  // fake claude exits 0 printing nothing -> 0-byte REVIEW.md
  const { root, bin } = await setupRepo(SHEBANG + "\nexit 0\n", [{ name: "review" }]);
  try {
    const r = await runCycle(root, {
      issueId: "CP-REVIEW-EMPTY",
      title: "completion proof empty",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.status === "failed" ? r.failingStep : null, "review");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    // completion_check fired exactly once with status fail
    const check = expectExactlyOne(
      events.filter((e) => e.event === "step.completion_check"),
      "step.completion_check",
    );
    assert.equal(check.step, "review");
    assert.equal(check.status, "fail");
    assert.match(String(check.artifact), /REVIEW\.md$/);

    // step.end review failed exactly once, carrying the descriptive message
    const ends = events.filter(
      (e) => e.event === "step.end" && e.step === "review" && e.status === "failed",
    );
    assert.equal(ends.length, 1, "step.end review failed must fire exactly once");
    assert.match(String(ends[0].stderr), /review exited 0 but .*REVIEW\.md is empty — treating as failure/);
    // Branch separation: the clean exit-0 path must NOT use the timeout wording.
    assert.doesNotMatch(String(ends[0].stderr), /timed out/);

    // routes through the normal failure path: cycle.end failed exactly once
    assert.equal(
      events.filter((e) => e.event === "cycle.end" && e.status === "failed").length,
      1,
      "cycle.end failed must fire exactly once",
    );
  } finally {
    await cleanup(root, bin);
  }
});

test("completion-proof: review exits 0 with whitespace-only stdout -> failed", async () => {
  // prints only whitespace -> whitespace-only REVIEW.md classified empty
  const { root, bin } = await setupRepo(SHEBANG + "\nprintf '   \\n\\t\\n'\n", [{ name: "review" }]);
  try {
    const r = await runCycle(root, {
      issueId: "CP-REVIEW-WS",
      title: "completion proof whitespace",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.status === "failed" ? r.failingStep : null, "review");
    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    const check = expectExactlyOne(
      events.filter((e) => e.event === "step.completion_check"),
      "step.completion_check",
    );
    assert.equal(check.status, "fail");
  } finally {
    await cleanup(root, bin);
  }
});

// ---------------------------------------------------------------------------
// Happy path / regression: non-empty artifact passes and the cycle advances
// ---------------------------------------------------------------------------

test("completion-proof: non-empty review artifact -> pass, next step runs", async () => {
  // review prints real content; plan (second step) also prints real content
  const { root, bin } = await setupRepo(SHEBANG + "\nprintf 'real artifact content\\n'\n", [
    { name: "review" },
    { name: "plan" },
  ]);
  try {
    const r = await runCycle(root, {
      issueId: "CP-PASS",
      title: "completion proof pass",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));

    const reviewCheck = events.filter(
      (e) => e.event === "step.completion_check" && e.step === "review",
    );
    assert.equal(reviewCheck.length, 1, "exactly one completion_check for review");
    assert.equal(reviewCheck[0].status, "pass");

    // the second step ran and ended ok (cycle advanced past the passed check)
    assert.equal(
      events.filter((e) => e.event === "step.end" && e.step === "plan" && e.status === "ok").length,
      1,
      "plan ran and ended ok after review passed",
    );
  } finally {
    await cleanup(root, bin);
  }
});

// ---------------------------------------------------------------------------
// Failure path (timeout branch): a timed-out empty-artifact step reports the
// timeout-specific wording matching its exit code, not the misleading
// "exited 0" message.
// ---------------------------------------------------------------------------

test("completion-proof: review times out with empty artifact -> timeout wording, not 'exited 0'", async () => {
  // The fake claude hangs (sleep 30) while writing nothing to stdout. With a
  // 200 ms step timeout it is SIGTERM-killed (r.timedOut === true) long before
  // producing output, leaving an empty REVIEW.md. The 30 s ≫ 200 ms margin
  // (~150x) keeps the kill firing well before stdout, so the empty-artifact
  // outcome is stable even on a slow runner.
  const { root, bin } = await setupRepo(SHEBANG + "\nsleep 30\n", [{ name: "review" }], 200);
  try {
    const r = await runCycle(root, {
      issueId: "CP-REVIEW-TIMEOUT",
      title: "completion proof timeout",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.status === "failed" ? r.failingStep : null, "review");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));

    // completion_check fired exactly once with status fail (cardinality-pinned)
    const checks = events.filter(
      (e) => e.event === "step.completion_check" && e.step === "review",
    );
    assert.equal(checks.length, 1, "step.completion_check for review must fire exactly once");
    assert.equal(checks[0].status, "fail");

    // step.end review failed exactly once, carrying the timeout-specific message
    const ends = events.filter(
      (e) => e.event === "step.end" && e.step === "review" && e.status === "failed",
    );
    assert.equal(ends.length, 1, "step.end review failed must fire exactly once");
    const stderr = String(ends[0].stderr);
    // The interpolated exit code is the actual non-zero code the killed step
    // reported (signal-derived, e.g. 143 under a shell-spawned child or -1 when
    // the agent lane reports the kill) — the formatter never hard-codes it.
    assert.match(stderr, /review timed out \(exit -?\d+\)/);
    assert.match(stderr, /— treating as failure/);
    // The contradiction this cycle fixes: no "exited 0" on a SIGTERM-killed step.
    assert.doesNotMatch(stderr, /exited 0/);
    // Exit code is the non-zero kill code, not 0.
    assert.notEqual(ends[0].exit_code, 0);
  } finally {
    await cleanup(root, bin);
  }
});

// ---------------------------------------------------------------------------
// Regression (salvage): a timed-out step whose artifact is non-empty still
// takes the step.timeout_salvaged accept path — the message branch must not
// affect salvage.
// ---------------------------------------------------------------------------

test("completion-proof: timed-out review with non-empty artifact -> salvaged, cycle ok", async () => {
  // Write real content to stdout immediately, then hang. The captured stdout
  // yields a non-empty REVIEW.md, so the proof passes and the timeout takes the
  // salvage path. The artifact write is a single printf that completes well
  // within the 200 ms timer before the sleep.
  const { root, bin } = await setupRepo(
    SHEBANG + "\nprintf 'real artifact content\\n'\nsleep 30\n",
    [{ name: "review" }],
    200,
  );
  try {
    const r = await runCycle(root, {
      issueId: "CP-REVIEW-SALVAGE",
      title: "completion proof salvage",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));

    // completion_check passed; salvage path accepted the work.
    const checks = events.filter(
      (e) => e.event === "step.completion_check" && e.step === "review",
    );
    assert.equal(checks.length, 1, "step.completion_check for review must fire exactly once");
    assert.equal(checks[0].status, "pass");

    const salvaged = events.filter(
      (e) => e.event === "step.timeout_salvaged" && e.step === "review",
    );
    assert.equal(salvaged.length, 1, "step.timeout_salvaged must fire exactly once for review");

    // review ended ok (not failed) despite the timeout.
    assert.equal(
      events.filter((e) => e.event === "step.end" && e.step === "review" && e.status === "ok").length,
      1,
      "review ended ok via salvage",
    );
  } finally {
    await cleanup(root, bin);
  }
});

// ---------------------------------------------------------------------------
// No-op path: an agent step that declares no artifact is unaffected
// ---------------------------------------------------------------------------

test("completion-proof: reflection (no declared artifact) -> no completion_check, no contract failure", async () => {
  // reflection is not in STEP_ARTIFACTS; empty stdout must not fail it via the contract
  const { root, bin } = await setupRepo(SHEBANG + "\nexit 0\n", [{ name: "reflection" }]);
  try {
    const r = await runCycle(root, {
      issueId: "CP-REFLECTION",
      title: "completion proof reflection no-op",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    assert.equal(
      events.filter((e) => e.event === "step.completion_check").length,
      0,
      "no completion_check for a step that declares no artifact",
    );
  } finally {
    await cleanup(root, bin);
  }
});
