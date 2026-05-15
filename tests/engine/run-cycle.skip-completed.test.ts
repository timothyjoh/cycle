import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle, shouldSkipForArtifact } from "../../src/engine/run-cycle.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

function workflowYml(stepsBody: string): string {
  return `engine:
  max_consecutive_failures: 2
  base_branch: main
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    max_cycle_attempts: 3
    no_branch: true
    steps:
${stepsBody}`;
}

const STEPS_BODY = `      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
      - name: research
        agent: claudecode
        prompt: prompts/research.md
      - name: plan
        agent: claudecode
        prompt: prompts/plan.md
`;

const SLUG = "skip-test";
const TITLE = "skip test";
const CYCLE_ID = "0001";

async function setupRepo(opts: {
  fakeClaudeBody: string;
  seed: { spec?: string; research?: string; plan?: string };
}) {
  const root = await mkdtemp(join(tmpdir(), "cycle-skip-rc-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-skip-bin-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);

  await mkdir(join(root, ".cycle/prompts"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), workflowYml(STEPS_BODY), "utf8");
  await writeFile(join(root, ".cycle/prompts/spec.md"), "noop", "utf8");
  await writeFile(join(root, ".cycle/prompts/research.md"), "noop", "utf8");
  await writeFile(join(root, ".cycle/prompts/plan.md"), "noop", "utf8");

  const fake = join(bin, "claude");
  await writeFile(fake, opts.fakeClaudeBody, "utf8");
  await chmod(fake, 0o755);

  const artifactDir = join(root, "docs", "cycle", `${CYCLE_ID}-feature-${SLUG}`);
  await mkdir(artifactDir, { recursive: true });
  if (opts.seed.spec !== undefined) await writeFile(join(artifactDir, "SPEC.md"), opts.seed.spec, "utf8");
  if (opts.seed.research !== undefined) await writeFile(join(artifactDir, "RESEARCH.md"), opts.seed.research, "utf8");
  if (opts.seed.plan !== undefined) await writeFile(join(artifactDir, "PLAN.md"), opts.seed.plan, "utf8");

  return { root, bin, artifactDir };
}

async function cleanup(root: string, bin: string) {
  await rm(root, { recursive: true, force: true });
  await rm(bin, { recursive: true, force: true });
}

// A payload large enough to clear SPEC_MIN_BYTES (200) for any of the seeded artifacts.
const BIG = "x".repeat(300);

test("shouldSkipForArtifact: skip when artifact exists with > 0 bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-skip-helper-"));
  try {
    const dir = join(root, "art");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "SPEC.md"), "hi", "utf8");
    const r = await shouldSkipForArtifact(dir, "spec");
    assert.equal(r.skip, true);
    if (r.skip) assert.equal(r.artifactPath, join(dir, "SPEC.md"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("shouldSkipForArtifact: don't skip when artifact is zero bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-skip-helper-"));
  try {
    const dir = join(root, "art");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "SPEC.md"), "", "utf8");
    const r = await shouldSkipForArtifact(dir, "spec");
    assert.equal(r.skip, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("shouldSkipForArtifact: don't skip when artifact missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-skip-helper-"));
  try {
    const dir = join(root, "art");
    await mkdir(dir, { recursive: true });
    const r = await shouldSkipForArtifact(dir, "spec");
    assert.equal(r.skip, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("shouldSkipForArtifact: ineligible step never skips", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-skip-helper-"));
  try {
    const dir = join(root, "art");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "BUILD.md"), BIG, "utf8");
    const r = await shouldSkipForArtifact(dir, "build");
    assert.equal(r.skip, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("attempt=0: artifacts present but no skips fire", async () => {
  // Fake claude succeeds (writes a non-trivial payload so the artifact write seam
  // overwrites our seeds — proving the agent actually ran).
  const { root, bin } = await setupRepo({
    fakeClaudeBody: `#!/bin/bash\nprintf '%s' '${BIG}'\n`,
    seed: { spec: BIG, research: BIG, plan: BIG },
  });
  try {
    const r = await runCycle(root, {
      cycleId: CYCLE_ID,
      issueId: "SKIP-A0",
      title: TITLE,
      workflow: "feature",
      attempt: 0,
      skipCompletedOnRetry: true,
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.doesNotMatch(log, /"event":"step\.skipped"/);
    assert.match(log, /"event":"step\.start","cycle_id":"0001","step":"spec"/);
    assert.match(log, /"event":"step\.start","cycle_id":"0001","step":"research"/);
    assert.match(log, /"event":"step\.start","cycle_id":"0001","step":"plan"/);
  } finally {
    await cleanup(root, bin);
  }
});

test("attempt=1: all three artifacts present > 0 bytes → all three skipped, agent not invoked", async () => {
  // Fake claude EXITS 1: if it runs, the step fails. Skips bypass it entirely.
  const { root, bin } = await setupRepo({
    fakeClaudeBody: `#!/bin/bash\necho "should not run" >&2\nexit 1\n`,
    seed: { spec: BIG, research: BIG, plan: BIG },
  });
  try {
    const r = await runCycle(root, {
      cycleId: CYCLE_ID,
      issueId: "SKIP-A1",
      title: TITLE,
      workflow: "feature",
      attempt: 1,
      skipCompletedOnRetry: true,
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const lines = log.trim().split("\n").filter((l) => l.length > 0);
    const skipped = lines.filter((l) => /"event":"step\.skipped"/.test(l));
    assert.equal(skipped.length, 3, "exactly three step.skipped events");
    for (const stepName of ["spec", "research", "plan"]) {
      assert.ok(
        skipped.some((l) =>
          new RegExp(`"step":"${stepName}".*"reason":"artifact_present"`).test(l),
        ),
        `step.skipped for ${stepName}`,
      );
    }
    assert.doesNotMatch(log, /"event":"step\.start","cycle_id":"0001","step":"spec"/);
    assert.doesNotMatch(log, /"event":"step\.start","cycle_id":"0001","step":"research"/);
    assert.doesNotMatch(log, /"event":"step\.start","cycle_id":"0001","step":"plan"/);
    assert.doesNotMatch(log, /"event":"step\.end","cycle_id":"0001","step":"spec"/);
  } finally {
    await cleanup(root, bin);
  }
});

test("attempt=1: only SPEC.md seeded → skip spec, run research+plan", async () => {
  const { root, bin } = await setupRepo({
    fakeClaudeBody: `#!/bin/bash\nprintf '%s' '${BIG}'\n`,
    seed: { spec: BIG },
  });
  try {
    const r = await runCycle(root, {
      cycleId: CYCLE_ID,
      issueId: "SKIP-A1P",
      title: TITLE,
      workflow: "feature",
      attempt: 1,
      skipCompletedOnRetry: true,
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"step\.skipped","cycle_id":"0001","step":"spec","reason":"artifact_present"/);
    assert.doesNotMatch(log, /"event":"step\.skipped","cycle_id":"0001","step":"research"/);
    assert.doesNotMatch(log, /"event":"step\.skipped","cycle_id":"0001","step":"plan"/);
    assert.match(log, /"event":"step\.start","cycle_id":"0001","step":"research"/);
    assert.match(log, /"event":"step\.end","cycle_id":"0001","step":"research","status":"ok"/);
    assert.match(log, /"event":"step\.start","cycle_id":"0001","step":"plan"/);
    assert.match(log, /"event":"step\.end","cycle_id":"0001","step":"plan","status":"ok"/);
  } finally {
    await cleanup(root, bin);
  }
});

test("attempt=1 with skipCompletedOnRetry=false: no skips, all three run", async () => {
  const { root, bin } = await setupRepo({
    fakeClaudeBody: `#!/bin/bash\nprintf '%s' '${BIG}'\n`,
    seed: { spec: BIG, research: BIG, plan: BIG },
  });
  try {
    const r = await runCycle(root, {
      cycleId: CYCLE_ID,
      issueId: "SKIP-OFF",
      title: TITLE,
      workflow: "feature",
      attempt: 1,
      skipCompletedOnRetry: false,
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.doesNotMatch(log, /"event":"step\.skipped"/);
    assert.match(log, /"event":"step\.start","cycle_id":"0001","step":"spec"/);
    assert.match(log, /"event":"step\.start","cycle_id":"0001","step":"research"/);
    assert.match(log, /"event":"step\.start","cycle_id":"0001","step":"plan"/);
  } finally {
    await cleanup(root, bin);
  }
});

test("attempt=1 with zero-byte SPEC.md: spec runs (not skipped)", async () => {
  const { root, bin } = await setupRepo({
    fakeClaudeBody: `#!/bin/bash\nprintf '%s' '${BIG}'\n`,
    seed: { spec: "", research: BIG, plan: BIG },
  });
  try {
    const r = await runCycle(root, {
      cycleId: CYCLE_ID,
      issueId: "SKIP-ZERO",
      title: TITLE,
      workflow: "feature",
      attempt: 1,
      skipCompletedOnRetry: true,
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.doesNotMatch(log, /"event":"step\.skipped","cycle_id":"0001","step":"spec"/);
    assert.match(log, /"event":"step\.start","cycle_id":"0001","step":"spec"/);
    assert.match(log, /"event":"step\.skipped","cycle_id":"0001","step":"research","reason":"artifact_present"/);
    assert.match(log, /"event":"step\.skipped","cycle_id":"0001","step":"plan","reason":"artifact_present"/);
  } finally {
    await cleanup(root, bin);
  }
});

test("two sequential runCycle calls with the same cycleId: second call (attempt=1) skips spec/research/plan", async () => {
  // Simulates the CLI fresh-pop retry path after the drainFailedRetry cycle_id
  // carry-over: first runCycle writes artifacts, second runCycle reuses the
  // same cycleId so the skip gate inspects the prior attempt's artifact dir.
  // Pre-fix this scenario could not happen — the CLI allocated a fresh
  // cycleId per pop and the skip gate always missed.
  const { root, bin } = await setupRepo({
    fakeClaudeBody: `#!/bin/bash\nprintf '%s' '${BIG}'\n`,
    seed: {},
  });
  try {
    const env = { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" };
    const r0 = await runCycle(root, {
      cycleId: CYCLE_ID,
      issueId: "SKIP-TWO",
      title: TITLE,
      workflow: "feature",
      attempt: 0,
      skipCompletedOnRetry: true,
      env,
    });
    assert.equal(r0.status, "ok");
    const r1 = await runCycle(root, {
      cycleId: CYCLE_ID,
      issueId: "SKIP-TWO",
      title: TITLE,
      workflow: "feature",
      attempt: 1,
      skipCompletedOnRetry: true,
      env,
    });
    assert.equal(r1.status, "ok");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const lines = log.trim().split("\n").filter((l) => l.length > 0);
    const skipped = lines.filter((l) => /"event":"step\.skipped"/.test(l));
    assert.equal(skipped.length, 3, "exactly three step.skipped events across both runs (all from second run)");
    for (const stepName of ["spec", "research", "plan"]) {
      assert.ok(
        skipped.some((l) =>
          new RegExp(`"step":"${stepName}".*"reason":"artifact_present"`).test(l),
        ),
        `step.skipped for ${stepName} on second run`,
      );
    }
  } finally {
    await cleanup(root, bin);
  }
});

test("attempt=1 with resume at index 0: skip gate self-suppresses on resume entry", async () => {
  // Seed all three; ensure the FIRST step under resume runs normally despite skip-gate
  // criteria otherwise matching. Subsequent steps still skip per the gate.
  const { root, bin } = await setupRepo({
    fakeClaudeBody: `#!/bin/bash\nprintf '%s' '${BIG}'\n`,
    seed: { spec: BIG, research: BIG, plan: BIG },
  });
  try {
    const r = await runCycle(root, {
      cycleId: CYCLE_ID,
      issueId: "SKIP-RES",
      title: TITLE,
      workflow: "feature",
      attempt: 1,
      skipCompletedOnRetry: true,
      resume: { startStepIndex: 0 },
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    // spec (resume entry) ran normally
    assert.match(log, /"event":"step\.start","cycle_id":"0001","step":"spec"/);
    assert.match(log, /"event":"step\.end","cycle_id":"0001","step":"spec","status":"ok"/);
    // research + plan skipped (not at resume entry)
    assert.match(log, /"event":"step\.skipped","cycle_id":"0001","step":"research"/);
    assert.match(log, /"event":"step\.skipped","cycle_id":"0001","step":"plan"/);
    // cycle.resume rather than cycle.start
    assert.match(log, /"event":"cycle\.resume"/);
  } finally {
    await cleanup(root, bin);
  }
});
