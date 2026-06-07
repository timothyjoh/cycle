import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// Integration coverage for the shared `--workflow` gate wired into both resume
// entrypoints (Task 4). An unknown resolved workflow (introduced here via
// fm.workflow) fails loud and cheap — resume #1 (runResumeOnce) emits the run:
// diagnostic + engine.warning{resume_workflow_missing} and skips without
// markInProgress; resume #2 (main loop) emits the run: diagnostic +
// engine.halted{unknown_workflow} and halts before markInProgress — neither
// reaches the deep runCycle throw.

const REPO = process.cwd();

async function ensureDist(): Promise<string> {
  const distPath = join(REPO, "dist", "cycle.js");
  await readFile(distPath, "utf8");
  return distPath;
}

function gitSync(cwd: string, args: string[]): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
}

async function initWorkflowFiles(root: string): Promise<void> {
  const cycleDir = join(root, ".cycle");
  await mkdir(join(cycleDir, "scripts"), { recursive: true });
  await writeFile(
    join(cycleDir, "workflows.yml"),
    `engine:
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
    max_cycle_attempts: 1
    steps:
      - name: verify
        agent: bash
        command: scripts/verify.sh
`,
    "utf8",
  );
  const scriptPath = join(cycleDir, "scripts", "verify.sh");
  await writeFile(scriptPath, "#!/bin/bash\nexit 0\n", "utf8");
  await chmod(scriptPath, 0o755);
  for (const d of ["inbox", "todo", "done", "blocked", "failed"]) {
    await mkdir(join(root, "docs/cycle/issues", d), { recursive: true });
  }
}

async function bootstrapRepo(root: string): Promise<void> {
  gitSync(root, ["init", "-b", "main"]);
  gitSync(root, ["config", "user.email", "t@t"]);
  gitSync(root, ["config", "user.name", "t"]);
  gitSync(root, ["commit", "--allow-empty", "-m", "init"]);
  await initWorkflowFiles(root);
}

// Resume #1 (runResumeOnce) refreshes the base via checkoutBase/pullBase before
// the workflow gate, so it needs a reachable origin remote to clone from.
async function setupRepoWithOrigin(): Promise<{ originRoot: string; workRoot: string }> {
  const originRoot = await mkdtemp(join(tmpdir(), "cycle-resume-gate-origin-"));
  const workRoot = await mkdtemp(join(tmpdir(), "cycle-resume-gate-work-"));
  gitSync(originRoot, ["init", "-b", "main"]);
  gitSync(originRoot, ["config", "user.email", "t@t"]);
  gitSync(originRoot, ["config", "user.name", "t"]);
  gitSync(originRoot, ["config", "receive.denyCurrentBranch", "ignore"]);
  gitSync(originRoot, ["commit", "--allow-empty", "-m", "init"]);

  await rm(workRoot, { recursive: true, force: true });
  const r = spawnSync("git", ["clone", originRoot, workRoot], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`clone failed: ${r.stderr}`);
  gitSync(workRoot, ["config", "user.email", "t@t"]);
  gitSync(workRoot, ["config", "user.name", "t"]);
  await initWorkflowFiles(workRoot);
  return { originRoot, workRoot };
}

async function seedIssue(
  root: string,
  id: string,
  title: string,
  workflow: string,
  status: "pending" | "in_progress",
  cycleId: string | null,
): Promise<void> {
  await writeFile(
    join(root, "docs/cycle/issues/todo", `${id}.md`),
    `---\nid: ${id}\ntitle: "${title}"\nworkflow: ${workflow}\ndepends_on: []\ntriaged_at: 2026-05-13T00:00:00Z\nsource: triage\n---\n\n${title}\n`,
    "utf8",
  );
  const row: Record<string, unknown> = {
    id,
    title,
    status,
    attempt: 0,
    priority: "normal",
    depends_on: [],
    triaged_at: "2026-05-13T00:00:00Z",
  };
  if (cycleId !== null) row.cycle_id = cycleId;
  await appendFile(join(root, ".cycle/tbd.jsonl"), JSON.stringify(row) + "\n", "utf8");
}

function parseEvents(text: string): Array<Record<string, unknown>> {
  return text.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
}

test("resume #2 (main loop): unknown fm.workflow halts loud before markInProgress", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-resume-gate-loop-"));
  try {
    await bootstrapRepo(root);
    // Pending row, no in-flight log tail ⇒ the main loop pops it and hits the gate.
    await seedIssue(root, "alpha", "first task", "bogus_wf", "pending", null);

    const r = spawnSync("node", [dist, "run", "--skip-preflight"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, CYCLE_BASE: "main" },
      timeout: 15_000,
    });

    assert.notEqual(r.status, 0, "engine must halt non-zero");
    assert.match(r.stderr, /run: unknown workflow "bogus_wf"/);

    const events = parseEvents(await readFile(join(root, ".cycle/log.jsonl"), "utf8"));
    const halted = events.filter((e) => e.event === "engine.halted" && e.reason === "unknown_workflow");
    assert.equal(halted.length, 1, "exactly one engine.halted{unknown_workflow}");
    assert.equal(halted[0].workflow, "bogus_wf");
    // Never reached spawn / the deep cycle.start.
    assert.equal(events.filter((e) => e.event === "cycle.start").length, 0, "no cycle.start");

    // The row stays pending (markInProgress never ran — no attempt burned).
    const queue = (await readFile(join(root, ".cycle/tbd.jsonl"), "utf8")).trim().split("\n");
    const last = JSON.parse(queue[queue.length - 1]) as Record<string, unknown>;
    assert.equal(last.status, "pending", "row remains pending — no attempt burned");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resume #1 (runResumeOnce): unknown fm.workflow skips loud without markInProgress", async () => {
  const dist = await ensureDist();
  const { originRoot, workRoot } = await setupRepoWithOrigin();
  try {
    // in_progress row + matching in-flight log tail ⇒ runResumeOnce drives it.
    await seedIssue(workRoot, "alpha", "first task", "bogus_wf", "in_progress", "0042");
    const lines = [
      JSON.stringify({ ts: "2026-05-13T00:00:00.000Z", event: "engine.start" }),
      JSON.stringify({
        ts: "2026-05-13T00:00:01.000Z",
        event: "cycle.start",
        cycle_id: "0042",
        workflow: "feature",
        title: "first task",
        issue_id: "alpha",
      }),
    ];
    await writeFile(join(workRoot, ".cycle/log.jsonl"), lines.join("\n") + "\n", "utf8");

    const r = spawnSync("node", [dist, "run", "--skip-preflight"], {
      cwd: workRoot,
      encoding: "utf8",
      env: { ...process.env, CYCLE_BASE: "main" },
      timeout: 15_000,
    });

    assert.match(r.stderr, /run: unknown workflow "bogus_wf"/);

    const events = parseEvents(await readFile(join(workRoot, ".cycle/log.jsonl"), "utf8"));
    const warned = events.filter(
      (e) => e.event === "engine.warning" && e.reason === "resume_workflow_missing",
    );
    assert.equal(warned.length, 1, "exactly one resume_workflow_missing warning");
    assert.equal(warned[0].workflow, "bogus_wf");
    // Resume skipped before markInProgress/spawn — no engine.resume, no new cycle.start.
    assert.equal(events.filter((e) => e.event === "engine.resume").length, 0, "no engine.resume");
    assert.equal(events.filter((e) => e.event === "cycle.resume").length, 0, "no cycle.resume");
  } finally {
    await rm(originRoot, { recursive: true, force: true });
    await rm(workRoot, { recursive: true, force: true });
  }
});
