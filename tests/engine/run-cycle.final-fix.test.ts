import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle } from "../../src/engine/run-cycle.ts";
import { parseLogTail } from "../../src/engine/log-tail.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

function workflowYml(stepsBody: string): string {
  return `engine:
  max_consecutive_failures: 2
  base_branch: main
  commit:
    mode: trunk
    push: false
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    max_cycle_attempts: 3
    steps:
${stepsBody}`;
}

async function setupGitRepo(root: string): Promise<void> {
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src/existing.ts"), "export const e = 0;\n", "utf8");
  git(root, ["add", "src/existing.ts"]);
  git(root, ["commit", "-m", "init"]);
}

async function findTouchedJson(root: string, cycleId: string): Promise<{ files: string[] }> {
  const entries = await readdir(join(root, "docs/cycle"));
  const dir = entries.find((e) => e.startsWith(`${cycleId}-`));
  assert.ok(dir, `no artifact dir found for cycle ${cycleId}`);
  const raw = await readFile(join(root, "docs/cycle", dir, "touched.json"), "utf8");
  return JSON.parse(raw) as { files: string[] };
}

const PINNED_CYCLE_ID = "0001";
const PINNED_TITLE = "final fix test";
const PINNED_SLUG = "final-fix-test"; // slugify("final fix test")

const FINAL_FIX_VERIFY_STEPS =
  "      - name: final_fix\n        agent: claudecode\n        prompt: prompts/final_fix.md\n        skip_unless: FINAL_FIXES.md\n" +
  "      - name: final_verify\n        agent: bash\n        command: scripts/verify.sh\n";

test("runCycle final_fix: skipped when FINAL_FIXES.md absent; final_verify still runs", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-ff-skip-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-ff-skip-bin-"));
  try {
    await setupGitRepo(root);
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await mkdir(join(root, ".cycle/scripts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/final_fix.md"), "FINAL_FIX_PROMPT", "utf8");
    const verifyPath = join(root, ".cycle/scripts/verify.sh");
    await writeFile(verifyPath, "#!/bin/bash\nexit 0\n", "utf8");
    await chmod(verifyPath, 0o755);
    await writeFile(join(root, ".cycle/workflows.yml"), workflowYml(FINAL_FIX_VERIFY_STEPS), "utf8");

    // final_fix is skipped so claude should never be called; fail loudly if it is
    const fakeClaude = join(bin, "claude");
    await writeFile(fakeClaude, "#!/bin/bash\necho 'unexpected claude call' >&2\nexit 1\n", "utf8");
    await chmod(fakeClaude, 0o755);

    const r = await runCycle(root, {
      cycleId: PINNED_CYCLE_ID,
      issueId: "ff-skip",
      title: PINNED_TITLE,
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = log.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);

    // final_fix must emit exactly one step.end with status:skipped
    const skipped = events.filter(
      (e) => e.event === "step.end" && e.step === "final_fix" && e.status === "skipped",
    );
    assert.equal(skipped.length, 1, "expected exactly one step.end {step:final_fix, status:skipped}");
    assert.equal(skipped[0].reason, "skip_unless_artifact_missing");
    assert.equal(skipped[0].artifact, "FINAL_FIXES.md");

    // final_verify must still start after the skip
    const verifyStarts = events.filter((e) => e.event === "step.start" && e.step === "final_verify");
    assert.equal(verifyStarts.length, 1, "expected final_verify to start after final_fix was skipped");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runCycle final_fix: runs when FINAL_FIXES.md present", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-ff-run-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-ff-run-bin-"));
  try {
    await setupGitRepo(root);
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await mkdir(join(root, ".cycle/scripts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/final_fix.md"), "FINAL_FIX_PROMPT", "utf8");
    const verifyPath = join(root, ".cycle/scripts/verify.sh");
    await writeFile(verifyPath, "#!/bin/bash\nexit 0\n", "utf8");
    await chmod(verifyPath, 0o755);
    await writeFile(join(root, ".cycle/workflows.yml"), workflowYml(FINAL_FIX_VERIFY_STEPS), "utf8");

    // Pre-create artifact dir and place FINAL_FIXES.md
    const artifactDir = join(root, "docs/cycle", `${PINNED_CYCLE_ID}-feature-${PINNED_SLUG}`);
    await mkdir(artifactDir, { recursive: true });
    await writeFile(join(artifactDir, "FINAL_FIXES.md"), "# Final Fixes\n- fix the thing\n", "utf8");

    const fakeClaude = join(bin, "claude");
    await writeFile(
      fakeClaude,
      "#!/bin/bash\nprintf '## Summary\\nFinal fix applied.\\n'\n",
      "utf8",
    );
    await chmod(fakeClaude, 0o755);

    const r = await runCycle(root, {
      cycleId: PINNED_CYCLE_ID,
      issueId: "ff-run",
      title: PINNED_TITLE,
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const events = log.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);

    // final_fix must have started
    const starts = events.filter((e) => e.event === "step.start" && e.step === "final_fix");
    assert.equal(starts.length, 1, "expected exactly one step.start for final_fix");

    // final_fix must end with ok
    const ends = events.filter((e) => e.event === "step.end" && e.step === "final_fix" && e.status === "ok");
    assert.equal(ends.length, 1, "expected step.end {step:final_fix, status:ok}");

    // no skipped event for final_fix
    const skipped = events.filter((e) => e.event === "step.end" && e.step === "final_fix" && e.status === "skipped");
    assert.equal(skipped.length, 0, "expected no skipped event for final_fix when FINAL_FIXES.md is present");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runCycle final_fix: footprint appended to touched.json, excludes pre-existing dirty", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-ff-touch-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-ff-touch-bin-"));
  try {
    await setupGitRepo(root);

    // Dirty src/existing.ts BEFORE the step — must be excluded from touched.json
    await writeFile(join(root, "src/existing.ts"), "export const e = 1;\n", "utf8");

    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/final_fix.md"), "FINAL_FIX_PROMPT", "utf8");
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml(
        "      - name: final_fix\n        agent: claudecode\n        prompt: prompts/final_fix.md\n        skip_unless: FINAL_FIXES.md\n",
      ),
      "utf8",
    );

    // Pre-create artifact dir with FINAL_FIXES.md
    const artifactDir = join(root, "docs/cycle", `${PINNED_CYCLE_ID}-feature-${PINNED_SLUG}`);
    await mkdir(artifactDir, { recursive: true });
    await writeFile(join(artifactDir, "FINAL_FIXES.md"), "# Final Fixes\n- create new file\n", "utf8");

    const fakeClaude = join(bin, "claude");
    await writeFile(
      fakeClaude,
      `#!/bin/bash\nmkdir -p "${root}/src"\necho '// final fixed' > "${root}/src/final-fixed.ts"\ngit -C "${root}" add src/final-fixed.ts\nprintf '## Summary\\nCreated final-fixed.ts.\\n'\n`,
      "utf8",
    );
    await chmod(fakeClaude, 0o755);

    const r = await runCycle(root, {
      cycleId: PINNED_CYCLE_ID,
      issueId: "ff-touch",
      title: PINNED_TITLE,
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const content = await findTouchedJson(root, PINNED_CYCLE_ID);
    assert.ok(content.files.includes("src/final-fixed.ts"), "touched.json must include file created during final_fix");
    assert.ok(!content.files.includes("src/existing.ts"), "touched.json must not include file dirty before final_fix");
    // files array must be sorted
    const sorted = [...content.files].sort();
    assert.deepEqual(content.files, sorted, "touched.json files must be sorted");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("parseLogTail resume dedup: final_verify is distinct from verify", () => {
  function ev(event: string, fields: Record<string, unknown> = {}): string {
    return JSON.stringify({ ts: "2026-01-01T00:00:00.000Z", event, cycle_id: "0001", ...fields });
  }
  const text = [
    ev("cycle.start", { workflow: "feature", title: "t", issue_id: "i" }),
    ev("step.end", { step: "verify", status: "ok" }),
    ev("step.end", { step: "reflection", status: "ok" }),
  ].join("\n");

  const r = parseLogTail(text);
  assert.ok(r, "parseLogTail should return an in-flight cycle");
  assert.ok(r.completedSteps.includes("verify"), "completedSteps must include 'verify'");
  assert.ok(r.completedSteps.includes("reflection"), "completedSteps must include 'reflection'");
  assert.ok(
    !r.completedSteps.includes("final_verify"),
    "'final_verify' must not be treated as done just because 'verify' is done",
  );
});
