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
