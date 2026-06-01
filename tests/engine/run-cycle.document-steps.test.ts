import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, chmod, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  runCycle,
  STEP_ARTIFACTS,
  ARTIFACT_STEPS,
} from "../../src/engine/run-cycle.ts";
import { expectExactlyOne } from "../helpers.ts";

// The completion-proof contract keys on `step.name` (a key in STEP_ARTIFACTS),
// independent of the workflow name, so a `plan_documents`/`authoring`/
// `review_documents` step driven under a `feature` workflow exercises the
// identical code path the `document` workflow uses. We reuse the established
// harness pattern (real git temp repo + fake `claude` on PATH) rather than
// constructing a real `document` workflow.

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error("git " + args.join(" ") + ": " + r.stderr);
  return r.stdout;
}

function workflowYml(steps: { name: string }[]): string {
  const stepLines = steps
    .map((s) => `      - name: ${s.name}\n        agent: claudecode\n        prompt: prompts/${s.name}.md`)
    .join("\n");
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
    stepLines,
  ].join("\n") + "\n";
}

async function setupRepo(
  fakeBody: string,
  steps: { name: string }[],
): Promise<{ root: string; bin: string }> {
  const root = await mkdtemp(join(tmpdir(), "cycle-doc-steps-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-doc-steps-bin-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  await mkdir(join(root, ".cycle/prompts"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), workflowYml(steps), "utf8");
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
// Membership: the three document steps are declared artifact steps
// ---------------------------------------------------------------------------

test("STEP_ARTIFACTS + ARTIFACT_STEPS include the three document steps", () => {
  for (const [name, artifact] of [
    ["plan_documents", "PLAN_DOCUMENTS.md"],
    ["authoring", "AUTHORING.md"],
    ["review_documents", "REVIEW_DOCUMENTS.md"],
  ] as const) {
    assert.deepEqual(STEP_ARTIFACTS.get(name), { artifact, proof: "nonempty" });
    assert.equal(ARTIFACT_STEPS.has(name), true);
  }
});

test("ARTIFACT_STEPS stays derived from STEP_ARTIFACTS keys (single source of truth)", () => {
  assert.deepEqual([...ARTIFACT_STEPS].sort(), [...STEP_ARTIFACTS.keys()].sort());
});

// ---------------------------------------------------------------------------
// Happy path: non-empty plan_documents artifact -> pass, next step runs,
// and no append_system_prompt_ignored warning for a claudecode document step
// ---------------------------------------------------------------------------

test("document step: non-empty plan_documents artifact -> pass, next step runs", async () => {
  const { root, bin } = await setupRepo(SHEBANG + "\nprintf 'real artifact content\\n'\n", [
    { name: "plan_documents" },
    { name: "authoring" },
  ]);
  try {
    const r = await runCycle(root, {
      issueId: "DOC-PASS",
      title: "doc steps pass",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));

    const checks = events.filter(
      (e) => e.event === "step.completion_check" && e.step === "plan_documents",
    );
    assert.equal(checks.length, 1, "exactly one completion_check for plan_documents");
    assert.equal(checks[0].status, "pass");
    assert.match(String(checks[0].artifact), /PLAN_DOCUMENTS\.md$/);

    // the second document step ran and ended ok (cycle advanced past the pass)
    assert.equal(
      events.filter(
        (e) => e.event === "step.end" && e.step === "authoring" && e.status === "ok",
      ).length,
      1,
      "authoring ran and ended ok after plan_documents passed",
    );

    // a claudecode document step must NOT trigger the ignored-prompt warning
    assert.equal(
      events.filter(
        (e) => e.event === "step.warning" && e.reason === "append_system_prompt_ignored",
      ).length,
      0,
      "no append_system_prompt_ignored warning for a claudecode document step",
    );
  } finally {
    await cleanup(root, bin);
  }
});

// ---------------------------------------------------------------------------
// Failure path: empty (0-byte) artifact under the nonempty policy
// ---------------------------------------------------------------------------

test("document step: authoring exits 0 with empty stdout -> failed via the contract", async () => {
  const { root, bin } = await setupRepo(SHEBANG + "\nexit 0\n", [{ name: "authoring" }]);
  try {
    const r = await runCycle(root, {
      issueId: "DOC-AUTHORING-EMPTY",
      title: "doc steps empty",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.status === "failed" ? r.failingStep : null, "authoring");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    const check = expectExactlyOne(
      events.filter((e) => e.event === "step.completion_check"),
      "step.completion_check",
    );
    assert.equal(check.step, "authoring");
    assert.equal(check.status, "fail");
    assert.match(String(check.artifact), /AUTHORING\.md$/);

    const ends = events.filter(
      (e) => e.event === "step.end" && e.step === "authoring" && e.status === "failed",
    );
    assert.equal(ends.length, 1, "step.end authoring failed must fire exactly once");
    assert.match(
      String(ends[0].stderr),
      /authoring exited 0 but .*AUTHORING\.md is empty — treating as failure/,
    );

    assert.equal(
      events.filter((e) => e.event === "cycle.end" && e.status === "failed").length,
      1,
      "cycle.end failed must fire exactly once",
    );
  } finally {
    await cleanup(root, bin);
  }
});

// ---------------------------------------------------------------------------
// Failure path: whitespace-only artifact under the nonempty policy
// ---------------------------------------------------------------------------

test("document step: review_documents whitespace-only stdout -> failed", async () => {
  const { root, bin } = await setupRepo(SHEBANG + "\nprintf '   \\n\\t\\n'\n", [
    { name: "review_documents" },
  ]);
  try {
    const r = await runCycle(root, {
      issueId: "DOC-REVIEW-WS",
      title: "doc steps whitespace",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.status === "failed" ? r.failingStep : null, "review_documents");
    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    const check = expectExactlyOne(
      events.filter((e) => e.event === "step.completion_check"),
      "step.completion_check",
    );
    assert.equal(check.step, "review_documents");
    assert.equal(check.status, "fail");
  } finally {
    await cleanup(root, bin);
  }
});
