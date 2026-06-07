import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
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

// A single-walkthrough_capture-step feature workflow. `engineLines` are inserted
// verbatim into the engine block (e.g. `  walkthrough_required: true\n`).
function workflowYml(engineLines: string): string {
  return `engine:
  max_consecutive_failures: 2
  base_branch: main
${engineLines}  commit:
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

async function setupRepo(engineLines = ""): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cycle-wt-gate-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  await mkdir(join(root, ".cycle"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), workflowYml(engineLines), "utf8");
  return root;
}

async function writeHook(root: string, body: string): Promise<void> {
  const hook = join(root, ".cycle", "walkthrough.sh");
  await writeFile(hook, body, "utf8");
  await chmod(hook, 0o755);
}

// A hook that writes one media frame plus a chosen sidecar body. `sidecar` of
// undefined writes no sidecar (media only).
function hookWithSidecar(sidecar?: string): string {
  let body = "#!/bin/bash\nset -e\nmkdir -p \"$CYCLE_ARTIFACT_DIR/walkthrough\"\n";
  body += "echo frame > \"$CYCLE_ARTIFACT_DIR/walkthrough/shot.png\"\n";
  if (sidecar !== undefined) {
    body += `cat > "$CYCLE_ARTIFACT_DIR/walkthrough/walkthrough-status.json" <<'JSON'\n${sidecar}\nJSON\n`;
  }
  body += "exit 0\n";
  return body;
}

async function writeTodoIssue(root: string, issueId: string, frontmatter: string): Promise<void> {
  const dir = join(root, "docs/cycle/issues/todo");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${issueId}.md`), `---\n${frontmatter}\n---\nbody\n`, "utf8");
}

function readEvents(log: string): Record<string, unknown>[] {
  return log.trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
}

function stepEvents(events: Record<string, unknown>[], stepName: string): Record<string, unknown>[] {
  return events.filter(e => e.step === stepName);
}

// AC: block path — required + UI (no todo file ⇒ fail-closed UI) + degraded sidecar.
test("gate blocks a UI cycle with a degraded sidecar in a required repo", async () => {
  const root = await setupRepo("  walkthrough_required: true\n");
  try {
    await writeHook(root, hookWithSidecar('{"degraded":true,"reason":"only /login"}'));
    const r = await runCycle(root, {
      issueId: "WTG-block",
      title: "degraded",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.failingStep, "walkthrough_capture");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    const degraded = expectExactlyOne(events, "walkthrough.degraded");
    assert.equal(events.filter(e => e.event === "walkthrough.degraded").length, 1);
    assert.equal(degraded.step, "walkthrough_capture");
    assert.equal(degraded.reason, "degraded_flag: only /login");
    assert.match(degraded.sidecar as string, /^docs[/\\]cycle[/\\].+walkthrough[/\\]walkthrough-status\.json$/);

    const end = stepEvents(events, "walkthrough_capture").filter(e => e.event === "step.end");
    assert.equal(end.length, 1);
    assert.equal(end[0].status, "failed");
    assert.ok((end[0].stderr as string).includes("walkthrough did not demonstrate the feature"));

    const cycleEnd = events.find(e => e.event === "cycle.end");
    assert.equal(cycleEnd!.status, "failed");
    assert.equal(cycleEnd!.failing_step, "walkthrough_capture");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// AC: clean sidecar in a required repo ⇒ ok, no degraded event.
test("gate passes a UI cycle with a clean sidecar (degraded:false)", async () => {
  const root = await setupRepo("  walkthrough_required: true\n");
  try {
    await writeHook(root, hookWithSidecar('{"degraded":false}'));
    const r = await runCycle(root, {
      issueId: "WTG-clean",
      title: "clean",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    assert.equal(events.filter(e => e.event === "walkthrough.degraded").length, 0);
    const end = stepEvents(events, "walkthrough_capture").filter(e => e.event === "step.end");
    assert.equal(end.length, 1);
    assert.equal(end[0].status, "ok");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// AC: no sidecar in a required repo ⇒ ok (the hook ran and did not flag).
test("gate passes a UI cycle with no sidecar at all", async () => {
  const root = await setupRepo("  walkthrough_required: true\n");
  try {
    await writeHook(root, hookWithSidecar(undefined));
    const r = await runCycle(root, {
      issueId: "WTG-nosidecar",
      title: "no sidecar",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    assert.equal(events.filter(e => e.event === "walkthrough.degraded").length, 0);
    const end = stepEvents(events, "walkthrough_capture").filter(e => e.event === "step.end");
    assert.equal(end[0].status, "ok");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// AC: no hook in a required repo ⇒ inert skip, no gate.
test("gate is inert when no hook is present even with walkthrough_required", async () => {
  const root = await setupRepo("  walkthrough_required: true\n");
  try {
    const r = await runCycle(root, {
      issueId: "WTG-nohook",
      title: "no hook",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    const wt = stepEvents(events, "walkthrough_capture");
    const skipped = wt.filter(e => e.event === "step.end" && e.status === "skipped");
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0].reason, "walkthrough_hook_absent");
    assert.equal(wt.filter(e => e.event === "step.start").length, 0);
    assert.equal(events.filter(e => e.event === "walkthrough.degraded").length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// AC: exempt via expects_code: false ⇒ ok even with a degraded sidecar.
test("gate exempts a doc-only cycle (expects_code: false) despite a degraded sidecar", async () => {
  const root = await setupRepo("  walkthrough_required: true\n");
  try {
    await writeTodoIssue(root, "WTG-doconly", "expects_code: false");
    await writeHook(root, hookWithSidecar('{"degraded":true}'));
    const r = await runCycle(root, {
      issueId: "WTG-doconly",
      title: "doc only",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    assert.equal(events.filter(e => e.event === "walkthrough.degraded").length, 0);
    const end = stepEvents(events, "walkthrough_capture").filter(e => e.event === "step.end");
    assert.equal(end[0].status, "ok");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// AC: exempt via expects_ui: false ⇒ ok even with a degraded sidecar.
test("gate exempts an explicitly non-UI cycle (expects_ui: false) despite a degraded sidecar", async () => {
  const root = await setupRepo("  walkthrough_required: true\n");
  try {
    await writeTodoIssue(root, "WTG-noui", "expects_ui: false");
    await writeHook(root, hookWithSidecar('{"degraded":true}'));
    const r = await runCycle(root, {
      issueId: "WTG-noui",
      title: "non ui",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    assert.equal(events.filter(e => e.event === "walkthrough.degraded").length, 0);
    const end = stepEvents(events, "walkthrough_capture").filter(e => e.event === "step.end");
    assert.equal(end[0].status, "ok");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// AC: a UI cycle with expects_ui: true is still gated.
test("gate blocks a cycle with explicit expects_ui: true and a degraded sidecar", async () => {
  const root = await setupRepo("  walkthrough_required: true\n");
  try {
    await writeTodoIssue(root, "WTG-ui-true", "expects_ui: true");
    await writeHook(root, hookWithSidecar('{"degraded":true}'));
    const r = await runCycle(root, {
      issueId: "WTG-ui-true",
      title: "ui true",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.failingStep, "walkthrough_capture");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    assert.equal(events.filter(e => e.event === "walkthrough.degraded").length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// AC failure-path: present-but-unparseable sidecar fail-closes to a block.
test("gate fail-closes a UI cycle on an unparseable sidecar", async () => {
  const root = await setupRepo("  walkthrough_required: true\n");
  try {
    await writeHook(root, hookWithSidecar("{ this is not json"));
    const r = await runCycle(root, {
      issueId: "WTG-corrupt",
      title: "corrupt",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.failingStep, "walkthrough_capture");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    const degraded = expectExactlyOne(events, "walkthrough.degraded");
    assert.equal(events.filter(e => e.event === "walkthrough.degraded").length, 1);
    assert.match(degraded.reason as string, /^unparseable: /);
    const end = stepEvents(events, "walkthrough_capture").filter(e => e.event === "step.end");
    assert.equal(end[0].status, "failed");
    assert.ok((end[0].stderr as string).includes("walkthrough did not demonstrate the feature"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// AC regression: default-off (no walkthrough_required) ⇒ byte-for-byte unchanged
// even with a degraded sidecar present.
test("gate is fully inert when walkthrough_required is absent (default off)", async () => {
  const root = await setupRepo(); // no walkthrough_required
  try {
    await writeHook(root, hookWithSidecar('{"degraded":true}'));
    const r = await runCycle(root, {
      issueId: "WTG-default",
      title: "default off",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const events = readEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    assert.equal(events.filter(e => e.event === "walkthrough.degraded").length, 0);
    const end = stepEvents(events, "walkthrough_capture").filter(e => e.event === "step.end");
    assert.equal(end[0].status, "ok");
    assert.ok(end[0].walkthrough_artifacts, "media still collected on the default path");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
