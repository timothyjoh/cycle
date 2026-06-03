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
