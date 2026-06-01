import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, stat, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle } from "../../src/engine/run-cycle.ts";
import { expectExactlyOne } from "../helpers.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

// A minimal feature workflow whose only step is walkthrough_capture, so the
// cycle reaches it directly. engine.walkthrough_hook is set per-test.
function workflowYml(hookLine: string): string {
  return `engine:
  max_consecutive_failures: 2
  base_branch: main
${hookLine}  commit:
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
      - { name: walkthrough_capture, agent: bash }
`;
}

async function setupRepo(hookLine = ""): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cycle-walkthrough-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  await mkdir(join(root, ".cycle"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), workflowYml(hookLine), "utf8");
  return root;
}

async function writeHook(root: string, body: string): Promise<void> {
  const hook = join(root, ".cycle", "walkthrough.sh");
  await writeFile(hook, body, "utf8");
  await chmod(hook, 0o755);
}

function readEvents(log: string): Record<string, unknown>[] {
  return log.trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
}

function stepEvents(events: Record<string, unknown>[], stepName: string): Record<string, unknown>[] {
  return events.filter(e => e.step === stepName);
}

// Scenario 1: skip-clean — no hook present, step is inert.
test("walkthrough_capture skips clean when no hook is configured", async () => {
  const root = await setupRepo();
  try {
    const r = await runCycle(root, {
      issueId: "WT-1",
      title: "no hook",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    const wt = stepEvents(events, "walkthrough_capture");
    const skipped = wt.filter(e => e.event === "step.end" && e.status === "skipped");
    assert.equal(skipped.length, 1, "exactly one skipped step.end");
    assert.equal(skipped[0].reason, "walkthrough_hook_absent");
    assert.equal(wt.filter(e => e.event === "step.start").length, 0, "no step.start when inert");
    assert.equal(wt.filter(e => e.event === "step.end" && e.status === "failed").length, 0, "no failed step.end");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Scenario 2: configured hook produces media → pointer present.
test("walkthrough_capture collects media and attaches a pointer", async () => {
  const root = await setupRepo();
  try {
    await writeHook(
      root,
      "#!/bin/bash\nset -e\nmkdir -p \"$CYCLE_ARTIFACT_DIR/walkthrough\"\necho frame > \"$CYCLE_ARTIFACT_DIR/walkthrough/shot.png\"\nexit 0\n",
    );
    const r = await runCycle(root, {
      issueId: "WT-2",
      title: "with media",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    // Media file present under the artifact dir.
    const mediaPath = join(r.artifactDir, "walkthrough", "shot.png");
    assert.equal((await stat(mediaPath)).isFile(), true);

    // Manifest written.
    const manifestPath = join(r.artifactDir, "walkthrough-artifacts.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(manifest.count, 1);
    assert.deepEqual(manifest.media, [join("walkthrough", "shot.png")]);

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    const wt = stepEvents(events, "walkthrough_capture");
    assert.equal(wt.filter(e => e.event === "step.start").length, 1, "one step.start");
    const end = wt.filter(e => e.event === "step.end");
    assert.equal(end.length, 1, "one step.end");
    assert.equal(end[0].status, "ok");
    assert.equal(end[0].walkthrough_artifacts, manifestPath, "pointer references the manifest");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Scenario 2b: hook succeeds but emits no media → ok, no pointer.
test("walkthrough_capture succeeds without a pointer when the hook emits no media", async () => {
  const root = await setupRepo();
  try {
    await writeHook(root, "#!/bin/bash\nexit 0\n");
    const r = await runCycle(root, {
      issueId: "WT-2b",
      title: "no media",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    const end = stepEvents(events, "walkthrough_capture").filter(e => e.event === "step.end");
    assert.equal(end.length, 1);
    assert.equal(end[0].status, "ok");
    assert.ok(!("walkthrough_artifacts" in end[0]), "no pointer when no media");

    await assert.rejects(
      stat(join(r.artifactDir, "walkthrough-artifacts.json")),
      (e: NodeJS.ErrnoException) => e.code === "ENOENT",
      "no manifest written when there is no media",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Scenario 3: write-failure degrade — manifest path pre-created as a directory.
test("walkthrough_capture degrades via step.walkthrough_capture_failed when the manifest write fails", async () => {
  const root = await setupRepo();
  try {
    await writeHook(
      root,
      "#!/bin/bash\nset -e\nmkdir -p \"$CYCLE_ARTIFACT_DIR/walkthrough\"\necho frame > \"$CYCLE_ARTIFACT_DIR/walkthrough/shot.png\"\nexit 0\n",
    );
    // Pre-create the cycle artifact dir and make the manifest path a directory
    // so writeWalkthroughManifest raises EISDIR.
    const cycleId = "7777";
    const r0 = await runCycle(root, {
      cycleId,
      issueId: "WT-3-warmup",
      title: "degrade",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    await rm(join(root, ".cycle/log.jsonl"), { force: true });
    // The warmup run wrote a manifest file; replace it with a directory so the
    // next run's writeWalkthroughManifest raises EISDIR.
    await rm(join(r0.artifactDir, "walkthrough-artifacts.json"), { force: true });
    await mkdir(join(r0.artifactDir, "walkthrough-artifacts.json"), { recursive: true });

    const r = await runCycle(root, {
      cycleId,
      issueId: "WT-3",
      title: "degrade",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok", "cycle outcome unchanged by the degrade");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    const degrade = expectExactlyOne(events, "step.walkthrough_capture_failed");
    assert.equal(degrade.step, "walkthrough_capture");
    assert.ok(typeof degrade.error === "string" && (degrade.error as string).length > 0, "error recorded");

    const end = stepEvents(events, "walkthrough_capture").filter(e => e.event === "step.end");
    assert.equal(end.length, 1);
    assert.equal(end[0].status, "ok", "step.end stays ok");
    assert.ok(!("walkthrough_artifacts" in end[0]), "pointer omitted on degrade");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Scenario 4: hook non-zero exit → fatal routing.
test("walkthrough_capture routes a non-zero hook exit through the fatal step-failure path", async () => {
  const root = await setupRepo();
  try {
    await writeHook(root, "#!/bin/bash\necho \"capture failed\" >&2\nexit 1\n");
    const r = await runCycle(root, {
      issueId: "WT-4",
      title: "hook fails",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.failingStep, "walkthrough_capture");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    const end = stepEvents(events, "walkthrough_capture").filter(e => e.event === "step.end");
    assert.equal(end.length, 1);
    assert.equal(end[0].status, "failed");
    assert.ok((end[0].stderr as string).includes("capture failed"), "stderr surfaced");

    const cycleEnd = events.find(e => e.event === "cycle.end");
    assert.equal(cycleEnd!.status, "failed");
    assert.equal(cycleEnd!.failing_step, "walkthrough_capture");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Scenario 4b: hook hangs past the configured timeout → bounded-kill → fatal routing.
test("walkthrough_capture times out a hung hook and routes it through the fatal step-failure path", async () => {
  // A small real timeout (100ms) bounds the test; the hook sleeps far longer and
  // does NOT trap SIGTERM, so the first signal terminates it fast (exit 143) —
  // the SIGTERM→SIGKILL escalation itself is proven deterministically in the
  // unit test with an injected timer.
  const root = await setupRepo("  walkthrough_hook_timeout_ms: 100\n");
  try {
    await writeHook(root, "#!/bin/bash\necho \"recording…\" >&2\nsleep 30\n");
    const r = await runCycle(root, {
      issueId: "WT-4b",
      title: "hook hangs",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.failingStep, "walkthrough_capture");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    const end = stepEvents(events, "walkthrough_capture").filter(e => e.event === "step.end");
    assert.equal(end.length, 1);
    assert.equal(end[0].status, "failed");
    // Timeout-specific wording referencing the actual exit code, distinct from
    // an ordinary non-zero exit's raw stderr.
    assert.ok(
      (end[0].stderr as string).includes("timed out") && (end[0].stderr as string).includes("SIGTERM→SIGKILL"),
      "step.end.stderr carries timeout-specific wording",
    );

    // step.end (failed) must precede cycle.end (failed) for this step.
    const endIdx = events.findIndex(e => e.event === "step.end" && e.step === "walkthrough_capture" && e.status === "failed");
    const cycleEndIdx = events.findIndex(e => e.event === "cycle.end");
    assert.ok(endIdx >= 0 && cycleEndIdx > endIdx, "step.end precedes cycle.end");
    assert.equal(events.filter(e => e.event === "cycle.end").length, 1, "exactly one cycle.end");
    assert.equal(events[cycleEndIdx].status, "failed");
    assert.equal(events[cycleEndIdx].failing_step, "walkthrough_capture");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Scenario 4c: disabled (absent config) — a slow-but-finite hook runs to completion.
test("walkthrough_capture runs a slow hook to completion when no timeout is configured", async () => {
  const root = await setupRepo(); // no walkthrough_hook_timeout_ms → disabled
  try {
    await writeHook(
      root,
      "#!/bin/bash\nset -e\nsleep 0.3\nmkdir -p \"$CYCLE_ARTIFACT_DIR/walkthrough\"\necho frame > \"$CYCLE_ARTIFACT_DIR/walkthrough/shot.png\"\nexit 0\n",
    );
    const r = await runCycle(root, {
      issueId: "WT-4c",
      title: "slow hook no timeout",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    const end = stepEvents(events, "walkthrough_capture").filter(e => e.event === "step.end");
    assert.equal(end.length, 1);
    assert.equal(end[0].status, "ok", "slow hook completes normally with no timeout armed");
    assert.ok(end[0].walkthrough_artifacts, "media still collected");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Scenario 4d: a malformed (non-integer) timeout coerces to disabled at the read site.
test("walkthrough_capture treats a non-integer walkthrough_hook_timeout_ms as disabled", async () => {
  // 1.5 fails Number.isInteger → coerced to 0 (disabled). If it instead armed a
  // ~1.5ms timer, the slow hook below would be killed; it must complete ok.
  const root = await setupRepo("  walkthrough_hook_timeout_ms: 1.5\n");
  try {
    await writeHook(root, "#!/bin/bash\nsleep 0.3\nexit 0\n");
    const r = await runCycle(root, {
      issueId: "WT-4d",
      title: "non-integer timeout",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok", "non-integer timeout disables the guard");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    const end = stepEvents(events, "walkthrough_capture").filter(e => e.event === "step.end");
    assert.equal(end.length, 1);
    assert.equal(end[0].status, "ok");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ===========================================================================
// quickfix before/after phase-aware walkthrough capture (cycle 0026)
// ===========================================================================

// A quickfix-shaped workflow with trivial bash placeholder steps around the two
// phase-aware walkthrough steps, so the cycle exercises the real step ordering
// (walkthrough_before before quick_fix; walkthrough_after after verify) without
// invoking real agents. engine.walkthrough_hook is set per-test via hookLine.
function quickfixWorkflowYml(hookLine: string): string {
  return `engine:
  max_consecutive_failures: 2
  base_branch: main
${hookLine}  commit:
    mode: trunk
    push: false
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: quickfix
    max_cycle_attempts: 3
    steps:
      - { name: plan_fix,           agent: bash, command: scripts/noop.sh }
      - { name: walkthrough_before, agent: bash }
      - { name: quick_fix,          agent: bash, command: scripts/noop.sh }
      - { name: test_fix,           agent: bash, command: scripts/noop.sh }
      - { name: verify,             agent: bash, command: scripts/noop.sh }
      - { name: walkthrough_after,  agent: bash }
`;
}

async function setupQuickfixRepo(hookLine = ""): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cycle-walkthrough-qf-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  await mkdir(join(root, ".cycle", "scripts"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), quickfixWorkflowYml(hookLine), "utf8");
  const noop = join(root, ".cycle", "scripts", "noop.sh");
  await writeFile(noop, "#!/bin/bash\nexit 0\n", "utf8");
  await chmod(noop, 0o755);
  return root;
}

// Hook that branches on $CYCLE_WALKTHROUGH_PHASE, writing phase-scoped media
// (plus a sentinel recording the phase value it received) into the per-phase
// subdir so a test can assert the env was passed through.
const PHASE_HOOK =
  "#!/bin/bash\nset -e\n" +
  "d=\"$CYCLE_ARTIFACT_DIR/walkthrough/$CYCLE_WALKTHROUGH_PHASE\"\n" +
  "mkdir -p \"$d\"\n" +
  "printf '%s' \"$CYCLE_WALKTHROUGH_PHASE\" > \"$d/phase.txt\"\n" +
  "exit 0\n";

// quickfix Scenario A: happy path — both phases produce labeled media, per-phase
// manifests, pointers, and the hook receives CYCLE_WALKTHROUGH_PHASE.
test("quickfix walkthrough phases write labeled media, per-phase manifests, pointers, and pass CYCLE_WALKTHROUGH_PHASE", async () => {
  const root = await setupQuickfixRepo();
  try {
    await writeHook(root, PHASE_HOOK);
    const r = await runCycle(root, {
      issueId: "QF-A",
      title: "before/after capture",
      workflow: "quickfix",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    for (const phase of ["before", "after"] as const) {
      // Media lives under the phase-scoped subdir.
      const sentinel = join(r.artifactDir, "walkthrough", phase, "phase.txt");
      assert.equal((await stat(sentinel)).isFile(), true, `${phase} media present`);
      assert.equal(await readFile(sentinel, "utf8"), phase, `hook received CYCLE_WALKTHROUGH_PHASE=${phase}`);

      // Per-phase manifest, paths relative to artifactDir.
      const manifestPath = join(r.artifactDir, `walkthrough-${phase}-artifacts.json`);
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      assert.equal(manifest.count, 1);
      assert.deepEqual(manifest.media, [join("walkthrough", phase, "phase.txt")]);

      // Pointer on the matching step.end.
      const stepName = phase === "before" ? "walkthrough_before" : "walkthrough_after";
      const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
      const end = stepEvents(events, stepName).filter(e => e.event === "step.end");
      assert.equal(end.length, 1, `one step.end for ${stepName}`);
      assert.equal(end[0].status, "ok");
      assert.equal(end[0].walkthrough_artifacts, manifestPath, `${stepName} pointer references the per-phase manifest`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// quickfix Scenario B: skip-clean — no hook ⇒ each phase step inert.
test("quickfix walkthrough phases skip clean when no hook is configured", async () => {
  const root = await setupQuickfixRepo();
  try {
    const r = await runCycle(root, {
      issueId: "QF-B",
      title: "no hook",
      workflow: "quickfix",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    for (const stepName of ["walkthrough_before", "walkthrough_after"]) {
      const wt = stepEvents(events, stepName);
      const skipped = wt.filter(e => e.event === "step.end" && e.status === "skipped");
      assert.equal(skipped.length, 1, `exactly one skipped step.end for ${stepName}`);
      assert.equal(skipped[0].reason, "walkthrough_hook_absent");
      assert.equal(wt.filter(e => e.event === "step.start").length, 0, `no step.start for ${stepName}`);
      assert.equal(wt.filter(e => e.event === "step.end" && e.status === "failed").length, 0, `no failed step.end for ${stepName}`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// quickfix Scenario C: a non-zero hook exit on the `before` phase is fatal and
// quick_fix never runs.
test("quickfix walkthrough_before failure is fatal and quick_fix does not run", async () => {
  const root = await setupQuickfixRepo();
  try {
    // Fail only on the before phase; succeed otherwise.
    await writeHook(
      root,
      "#!/bin/bash\nif [ \"$CYCLE_WALKTHROUGH_PHASE\" = \"before\" ]; then echo \"before broke\" >&2; exit 1; fi\nexit 0\n",
    );
    const r = await runCycle(root, {
      issueId: "QF-C",
      title: "before fails",
      workflow: "quickfix",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.failingStep, "walkthrough_before");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    const end = stepEvents(events, "walkthrough_before").filter(e => e.event === "step.end");
    assert.equal(end.length, 1);
    assert.equal(end[0].status, "failed");
    assert.ok((end[0].stderr as string).includes("before broke"), "stderr surfaced");

    const cycleEnd = events.find(e => e.event === "cycle.end");
    assert.equal(cycleEnd!.status, "failed");
    assert.equal(cycleEnd!.failing_step, "walkthrough_before");

    // quick_fix must not have run — it follows walkthrough_before.
    assert.equal(stepEvents(events, "quick_fix").length, 0, "quick_fix did not run after the before failure");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// quickfix Scenario D: a post-success manifest-write failure on the `after`
// phase degrades via step.walkthrough_capture_failed; step stays ok, no pointer.
test("quickfix walkthrough_after degrades via step.walkthrough_capture_failed when the per-phase manifest write fails", async () => {
  const root = await setupQuickfixRepo();
  try {
    await writeHook(root, PHASE_HOOK);
    const cycleId = "8888";
    // Warmup run materializes the artifact dir and the after manifest file.
    // Same title as the real run so both resolve to the same artifactDir slug.
    const r0 = await runCycle(root, {
      cycleId,
      issueId: "QF-D-warmup",
      title: "degrade",
      workflow: "quickfix",
      env: { CYCLE_BASE: "main" },
    });
    await rm(join(root, ".cycle/log.jsonl"), { force: true });
    // Replace the after manifest with a directory so writeWalkthroughManifest
    // raises EISDIR on the next run's after phase.
    await rm(join(r0.artifactDir, "walkthrough-after-artifacts.json"), { force: true });
    await mkdir(join(r0.artifactDir, "walkthrough-after-artifacts.json"), { recursive: true });

    const r = await runCycle(root, {
      cycleId,
      issueId: "QF-D",
      title: "degrade",
      workflow: "quickfix",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok", "cycle outcome unchanged by the degrade");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    const degrade = events.filter(e => e.event === "step.walkthrough_capture_failed");
    assert.equal(degrade.length, 1, "exactly one degrade event");
    assert.equal(degrade[0].step, "walkthrough_after");
    assert.equal(degrade[0].artifact, join(r0.artifactDir, "walkthrough-after-artifacts.json"), "artifact points at the per-phase manifest");
    assert.ok(typeof degrade[0].error === "string" && (degrade[0].error as string).length > 0, "error recorded");

    const end = stepEvents(events, "walkthrough_after").filter(e => e.event === "step.end");
    assert.equal(end.length, 1);
    assert.equal(end[0].status, "ok", "step.end stays ok");
    assert.ok(!("walkthrough_artifacts" in end[0]), "pointer omitted on degrade");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Scenario 5: explicit engine.walkthrough_hook config path (not the convention).
test("walkthrough_capture honors an explicit engine.walkthrough_hook config path", async () => {
  const root = await setupRepo("  walkthrough_hook: bin/capture.sh\n");
  try {
    await mkdir(join(root, "bin"), { recursive: true });
    const hook = join(root, "bin", "capture.sh");
    await writeFile(
      hook,
      "#!/bin/bash\nset -e\nmkdir -p \"$CYCLE_ARTIFACT_DIR/walkthrough\"\necho v > \"$CYCLE_ARTIFACT_DIR/walkthrough/clip.mp4\"\nexit 0\n",
      "utf8",
    );
    await chmod(hook, 0o755);

    const r = await runCycle(root, {
      issueId: "WT-5",
      title: "configured hook",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    const end = stepEvents(events, "walkthrough_capture").filter(e => e.event === "step.end");
    assert.equal(end.length, 1);
    assert.equal(end[0].status, "ok");
    assert.ok(end[0].walkthrough_artifacts, "pointer present for configured hook");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
