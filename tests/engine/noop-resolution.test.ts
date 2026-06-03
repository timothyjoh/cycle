import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle } from "../../src/engine/run-cycle.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error("git " + args.join(" ") + ": " + r.stderr);
  return r.stdout;
}

function workflowYml(stepName: string): string {
  return [
    "engine:",
    "  max_consecutive_failures: 2",
    "  base_branch: main",
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
    `      - name: ${stepName}`,
    "        agent: claudecode",
    `        prompt: prompts/${stepName}.md`,
  ].join("\n") + "\n";
}

async function setupRepo(fakeBody: string, stepName: string): Promise<{ root: string; bin: string }> {
  const root = await mkdtemp(join(tmpdir(), "cycle-noop-res-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-noop-res-bin-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  await mkdir(join(root, ".cycle/prompts"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), workflowYml(stepName), "utf8");
  await writeFile(join(root, `.cycle/prompts/${stepName}.md`), "noop", "utf8");
  const fake = join(bin, "claude");
  await writeFile(fake, fakeBody, "utf8");
  await chmod(fake, 0o755);
  return { root, bin };
}

async function cleanup(root: string, bin: string) {
  await rm(root, { recursive: true, force: true });
  await rm(bin, { recursive: true, force: true });
}

const SHEBANG = "#!/bin/bash";

// Fake agent: locate the artifact dir via $CYCLE_ID, write a valid NOOP.md with
// the given reason, make NO src/scripts/tests change, and print a non-empty
// summary (which becomes BUILD.md/FIX.md and passes completion-proof).
function noopFake(reason: string): string {
  return [
    SHEBANG,
    'dir=$(ls -d docs/cycle/${CYCLE_ID}-* 2>/dev/null | head -1)',
    `printf 'reason: ${reason}\\n\\n## Evidence\\n- src/engine/run-cycle.ts:653 already implements this\\n' > "$dir/NOOP.md"`,
    'printf "## Summary\\nThe SPEC is already satisfied; see src/engine/run-cycle.ts:653.\\n"',
    "",
  ].join("\n");
}

function parseEvents(log: string): Array<Record<string, unknown>> {
  return log.split("\n").filter(l => l.trim()).map(l => {
    try { return JSON.parse(l) as Record<string, unknown>; } catch { return {}; }
  });
}

// Multi-step feature workflow (research-phase short-circuit tests need a step
// AFTER research to assert it never starts on a no-op, and to assert it DOES
// start when the marker is absent/malformed/unreadable).
function multiWorkflowYml(steps: string[]): string {
  const stepLines = steps.flatMap(s => [
    `      - name: ${s}`,
    "        agent: claudecode",
    `        prompt: prompts/${s}.md`,
  ]);
  return [
    "engine:",
    "  max_consecutive_failures: 2",
    "  base_branch: main",
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
    ...stepLines,
  ].join("\n") + "\n";
}

async function setupMultiRepo(fakeBody: string, steps: string[]): Promise<{ root: string; bin: string }> {
  const root = await mkdtemp(join(tmpdir(), "cycle-noop-res-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-noop-res-bin-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  await mkdir(join(root, ".cycle/prompts"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), multiWorkflowYml(steps), "utf8");
  for (const s of steps) {
    await writeFile(join(root, `.cycle/prompts/${s}.md`), s, "utf8");
  }
  const fake = join(bin, "claude");
  await writeFile(fake, fakeBody, "utf8");
  await chmod(fake, 0o755);
  return { root, bin };
}

// Fake agent that writes a valid research-phase NOOP.md (the artifact dir is the
// same per-cycle dir regardless of step) and prints a non-empty document body so
// every artifact step's completion-proof passes.
function researchNoopFake(reason: string): string {
  return [
    SHEBANG,
    'dir=$(ls -d docs/cycle/${CYCLE_ID}-* 2>/dev/null | head -1)',
    `printf 'reason: ${reason}\\n\\n## Evidence\\n- src/engine/run-cycle.ts:678 already implements this\\n' > "$dir/NOOP.md"`,
    'printf "## Doc\\nThe SPEC is already satisfied; see src/engine/run-cycle.ts:678.\\n"',
    "",
  ].join("\n");
}

test("noop-resolution: research exit 0 + valid NOOP.md ⇒ cycle.noop before plan/build/review", async () => {
  const { root, bin } = await setupMultiRepo(
    researchNoopFake("already-satisfied"),
    ["research", "plan", "build", "review"],
  );
  try {
    const r = await runCycle(root, {
      issueId: "NOOP-RESEARCH",
      title: "noop research",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "noop");
    assert.equal(r.status === "noop" ? r.reason : null, "already-satisfied");
    assert.equal(r.status === "noop" ? r.detectedAtStep : null, "research");

    const events = parseEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    const noop = events.filter(e => e.event === "cycle.noop");
    assert.equal(noop.length, 1, "cycle.noop must fire exactly once");
    assert.equal(noop[0].issue_id, "NOOP-RESEARCH");
    assert.equal(noop[0].reason, "already-satisfied");
    assert.equal(noop[0].detected_at_step, "research");

    // cycle.end {status:"noop"} fires once, after cycle.noop.
    assert.equal(events.filter(e => e.event === "cycle.end" && e.status === "noop").length, 1);
    const noopIdx = events.findIndex(e => e.event === "cycle.noop");
    const endIdx = events.findIndex(e => e.event === "cycle.end" && e.status === "noop");
    assert.ok(noopIdx < endIdx, "cycle.noop precedes cycle.end{noop}");

    // research step.end fires "ok" exactly once, before the no-op return.
    assert.equal(
      events.filter(e => e.event === "step.end" && e.step === "research" && e.status === "ok").length,
      1,
      "step.end research ok exactly once",
    );
    // No downstream step ever started.
    for (const downstream of ["plan", "build", "review"]) {
      assert.equal(
        events.filter(e => e.event === "step.start" && e.step === downstream).length,
        0,
        `no step.start for ${downstream} on a research short-circuit`,
      );
    }
    // research completion-proof passed (RESEARCH.md non-empty).
    assert.equal(events.filter(e => e.event === "step.completion_check" && e.status === "fail").length, 0);
    // finally cleanup ran; no leaked failure.
    assert.equal(events.filter(e => e.event === "cycle.checkout").length, 1);
    assert.equal(events.filter(e => e.event === "cycle.base_pull").length, 1);
    assert.equal(events.filter(e => e.event === "cycle.end" && e.status === "failed").length, 0);
  } finally {
    await cleanup(root, bin);
  }
});

test("noop-resolution: research reason category propagates verbatim (each category)", async () => {
  for (const reason of ["already-satisfied", "duplicate", "not-actionable"]) {
    const { root, bin } = await setupMultiRepo(researchNoopFake(reason), ["research", "plan"]);
    try {
      const r = await runCycle(root, {
        issueId: `NOOP-RES-${reason}`,
        title: "noop research reason",
        workflow: "feature",
        env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
      });
      assert.equal(r.status, "noop");
      assert.equal(r.status === "noop" ? r.reason : null, reason);
      assert.equal(r.status === "noop" ? r.detectedAtStep : null, "research");
      const events = parseEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
      const noop = events.filter(e => e.event === "cycle.noop");
      assert.equal(noop.length, 1);
      assert.equal(noop[0].reason, reason);
      assert.equal(noop[0].detected_at_step, "research");
    } finally {
      await cleanup(root, bin);
    }
  }
});

// Each failure-path case asserts: no cycle.noop, AND the post-research `plan`
// step.start fires (the cycle proceeds exactly as before this change).
async function expectResearchContinues(fakeBody: string, issueId: string) {
  const { root, bin } = await setupMultiRepo(fakeBody, ["research", "plan"]);
  try {
    const r = await runCycle(root, {
      issueId,
      title: "research continues",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.notEqual(r.status, "noop", "must not short-circuit on an invalid/absent marker");
    const events = parseEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    assert.equal(events.filter(e => e.event === "cycle.noop").length, 0, "no cycle.noop without a valid marker");
    assert.equal(
      events.filter(e => e.event === "step.start" && e.step === "plan").length,
      1,
      "plan starts after research when no short-circuit fires",
    );
  } finally {
    await cleanup(root, bin);
  }
}

test("noop-resolution: research marker ABSENT ⇒ research continues to plan", async () => {
  const fakeBody = [SHEBANG, 'printf "## Doc\\nstate\\n"', ""].join("\n");
  await expectResearchContinues(fakeBody, "NOOP-RES-ABSENT");
});

test("noop-resolution: research marker MALFORMED (no reason) ⇒ research continues", async () => {
  const fakeBody = [
    SHEBANG,
    'dir=$(ls -d docs/cycle/${CYCLE_ID}-* 2>/dev/null | head -1)',
    `printf '## Evidence\\n- src/engine/run-cycle.ts:678\\n' > "$dir/NOOP.md"`,
    'printf "## Doc\\nmalformed marker\\n"',
    "",
  ].join("\n");
  await expectResearchContinues(fakeBody, "NOOP-RES-NOREASON");
});

test("noop-resolution: research marker MALFORMED (bad reason) ⇒ research continues", async () => {
  const fakeBody = [
    SHEBANG,
    'dir=$(ls -d docs/cycle/${CYCLE_ID}-* 2>/dev/null | head -1)',
    `printf 'reason: whatever\\n- src/foo.ts:1\\n' > "$dir/NOOP.md"`,
    'printf "## Doc\\nbad reason category\\n"',
    "",
  ].join("\n");
  await expectResearchContinues(fakeBody, "NOOP-RES-BADREASON");
});

test("noop-resolution: research marker MALFORMED (zero evidence) ⇒ research continues", async () => {
  const fakeBody = [
    SHEBANG,
    'dir=$(ls -d docs/cycle/${CYCLE_ID}-* 2>/dev/null | head -1)',
    `printf 'reason: already-satisfied\\n\\n## Evidence\\n- no file line tokens here\\n' > "$dir/NOOP.md"`,
    'printf "## Doc\\nno evidence tokens\\n"',
    "",
  ].join("\n");
  await expectResearchContinues(fakeBody, "NOOP-RES-NOEVIDENCE");
});

test("noop-resolution: research marker WHITESPACE-only ⇒ research continues", async () => {
  const fakeBody = [
    SHEBANG,
    'dir=$(ls -d docs/cycle/${CYCLE_ID}-* 2>/dev/null | head -1)',
    `printf '   \\n\\n' > "$dir/NOOP.md"`,
    'printf "## Doc\\nwhitespace marker\\n"',
    "",
  ].join("\n");
  await expectResearchContinues(fakeBody, "NOOP-RES-WS");
});

test("noop-resolution: research marker UNREADABLE (dir at NOOP.md path) ⇒ research continues", async () => {
  // A directory at the NOOP.md path makes the read fail; classifyNoopMarker is
  // fail-closed and the run-cycle try/catch degrades to normal continuation.
  const fakeBody = [
    SHEBANG,
    'dir=$(ls -d docs/cycle/${CYCLE_ID}-* 2>/dev/null | head -1)',
    'mkdir -p "$dir/NOOP.md"',
    'printf "## Doc\\nunreadable marker\\n"',
    "",
  ].join("\n");
  await expectResearchContinues(fakeBody, "NOOP-RES-UNREADABLE");
});

test("noop-resolution: build exit 0 + empty diff + valid NOOP.md ⇒ cycle.noop", async () => {
  const { root, bin } = await setupRepo(noopFake("already-satisfied"), "build");
  try {
    const r = await runCycle(root, {
      issueId: "NOOP-BUILD",
      title: "noop build",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "noop");
    assert.equal(r.status === "noop" ? r.reason : null, "already-satisfied");
    assert.equal(r.status === "noop" ? r.detectedAtStep : null, "build");

    const events = parseEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    const noop = events.filter(e => e.event === "cycle.noop");
    assert.equal(noop.length, 1, "cycle.noop must fire exactly once");
    assert.equal(noop[0].cycle_id, r.cycleId);
    assert.equal(noop[0].issue_id, "NOOP-BUILD");
    assert.equal(noop[0].reason, "already-satisfied");
    assert.equal(noop[0].detected_at_step, "build");

    // cycle.end {status:"noop"} fires exactly once, after cycle.noop.
    assert.equal(events.filter(e => e.event === "cycle.end" && e.status === "noop").length, 1);
    const noopIdx = events.findIndex(e => e.event === "cycle.noop");
    const endIdx = events.findIndex(e => e.event === "cycle.end" && e.status === "noop");
    assert.ok(noopIdx < endIdx, "cycle.noop precedes cycle.end{noop}");

    // step.end for build fires "ok" (the step genuinely succeeded), exactly once.
    assert.equal(
      events.filter(e => e.event === "step.end" && e.step === "build" && e.status === "ok").length,
      1,
      "step.end build ok exactly once",
    );
    // No spurious completion-proof failure.
    assert.equal(
      events.filter(e => e.event === "step.completion_check" && e.status === "fail").length,
      0,
      "no failing completion_check on a no-op",
    );
    // finally cleanup ran (trunk mode: checkout skipped, base_pull present).
    assert.equal(events.filter(e => e.event === "cycle.checkout").length, 1);
    assert.equal(events.filter(e => e.event === "cycle.base_pull").length, 1);
    // No empty-diff failure leaked through.
    assert.equal(events.filter(e => e.event === "cycle.end" && e.status === "failed").length, 0);
  } finally {
    await cleanup(root, bin);
  }
});

test("noop-resolution: reason category propagates verbatim (each category)", async () => {
  for (const reason of ["already-satisfied", "duplicate", "not-actionable"]) {
    const { root, bin } = await setupRepo(noopFake(reason), "build");
    try {
      const r = await runCycle(root, {
        issueId: `NOOP-${reason}`,
        title: "noop reason prop",
        workflow: "feature",
        env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
      });
      assert.equal(r.status, "noop");
      assert.equal(r.status === "noop" ? r.reason : null, reason);
      const events = parseEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
      const noop = events.filter(e => e.event === "cycle.noop");
      assert.equal(noop.length, 1);
      assert.equal(noop[0].reason, reason);
    } finally {
      await cleanup(root, bin);
    }
  }
});

test("noop-resolution: fix step no-op ⇒ detected_at_step:'fix'", async () => {
  const { root, bin } = await setupRepo(noopFake("duplicate"), "fix");
  try {
    const r = await runCycle(root, {
      issueId: "NOOP-FIX",
      title: "noop fix",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "noop");
    assert.equal(r.status === "noop" ? r.detectedAtStep : null, "fix");
    const events = parseEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    const noop = events.filter(e => e.event === "cycle.noop");
    assert.equal(noop.length, 1);
    assert.equal(noop[0].detected_at_step, "fix");
  } finally {
    await cleanup(root, bin);
  }
});

test("noop-resolution: marker ABSENT ⇒ existing empty-diff failure preserved", async () => {
  // Print a non-empty summary (passes completion-proof) but write NO NOOP.md.
  const fakeBody = [SHEBANG, 'printf "## Summary\\nno changes\\n"', ""].join("\n");
  const { root, bin } = await setupRepo(fakeBody, "build");
  try {
    const r = await runCycle(root, {
      issueId: "NOOP-ABSENT",
      title: "noop absent",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.status === "failed" ? r.failingStep : null, "build");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /build post-condition failed/);
    const events = parseEvents(log);
    assert.equal(events.filter(e => e.event === "cycle.noop").length, 0, "no cycle.noop without a marker");
    assert.equal(events.filter(e => e.event === "cycle.end" && e.status === "failed").length, 1);
  } finally {
    await cleanup(root, bin);
  }
});

test("noop-resolution: MALFORMED marker (no reason) ⇒ falls through to failure", async () => {
  const fakeBody = [
    SHEBANG,
    'dir=$(ls -d docs/cycle/${CYCLE_ID}-* 2>/dev/null | head -1)',
    `printf '## Evidence\\n- src/engine/run-cycle.ts:653\\n' > "$dir/NOOP.md"`,
    'printf "## Summary\\nclaims done but malformed marker\\n"',
    "",
  ].join("\n");
  const { root, bin } = await setupRepo(fakeBody, "build");
  try {
    const r = await runCycle(root, {
      issueId: "NOOP-MALFORMED",
      title: "noop malformed",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /build post-condition failed/);
    const events = parseEvents(log);
    assert.equal(events.filter(e => e.event === "cycle.noop").length, 0, "malformed marker is not a no-op");
  } finally {
    await cleanup(root, bin);
  }
});

test("noop-resolution: MALFORMED marker (unrecognized reason) ⇒ failure", async () => {
  const fakeBody = [
    SHEBANG,
    'dir=$(ls -d docs/cycle/${CYCLE_ID}-* 2>/dev/null | head -1)',
    `printf 'reason: whatever\\n- src/foo.ts:1\\n' > "$dir/NOOP.md"`,
    'printf "## Summary\\nbad reason category\\n"',
    "",
  ].join("\n");
  const { root, bin } = await setupRepo(fakeBody, "build");
  try {
    const r = await runCycle(root, {
      issueId: "NOOP-BADREASON",
      title: "noop bad reason",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    const events = parseEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    assert.equal(events.filter(e => e.event === "cycle.noop").length, 0);
  } finally {
    await cleanup(root, bin);
  }
});
