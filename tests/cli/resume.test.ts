import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

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

async function writeWorkflows(
  root: string,
  opts: { maxConsecutiveFailures?: number; maxCycleAttempts?: number } = {},
): Promise<void> {
  const maxConsecutive = opts.maxConsecutiveFailures ?? 2;
  const maxCycleAttempts = opts.maxCycleAttempts ?? 3;
  await writeFile(
    join(root, ".cycle/workflows.yml"),
    `engine:
  max_consecutive_failures: ${maxConsecutive}
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
    max_cycle_attempts: ${maxCycleAttempts}
    steps:
      - name: spec
        agent: bash
        command: scripts/spec.sh
      - name: build
        agent: bash
        command: scripts/build.sh
      - name: verify
        agent: bash
        command: scripts/verify.sh
`,
    "utf8",
  );
}

async function writeStepScripts(root: string, opts: { failStep?: string } = {}): Promise<void> {
  const scripts = join(root, ".cycle/scripts");
  await mkdir(scripts, { recursive: true });
  for (const name of ["spec", "build", "verify"]) {
    const p = join(scripts, `${name}.sh`);
    const body = opts.failStep === name
      ? `#!/bin/bash\necho ${name}\nexit 1\n`
      : `#!/bin/bash\necho ${name}\n`;
    await writeFile(p, body, "utf8");
    await chmod(p, 0o755);
  }
}

async function setupRepoWithOrigin(): Promise<{ originRoot: string; workRoot: string }> {
  const originRoot = await mkdtemp(join(tmpdir(), "cycle-origin-"));
  const workRoot = await mkdtemp(join(tmpdir(), "cycle-test-"));
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
  return { originRoot, workRoot };
}

async function seedTodo(
  root: string,
  id: string,
  title: string,
  opts: {
    attempt?: number;
    status?: "pending" | "in_progress";
    cycle_id?: string | null;
    includeWorkflowInFrontmatter?: boolean;
  } = {},
): Promise<void> {
  const attempt = opts.attempt ?? 0;
  const status = opts.status ?? "in_progress";
  const cycleId = opts.cycle_id === undefined ? "0042" : opts.cycle_id;
  const includeWf = opts.includeWorkflowInFrontmatter ?? true;
  await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
  const fmLines = [
    `id: ${id}`,
    `title: "${title}"`,
    ...(includeWf ? ["workflow: feature"] : []),
    `depends_on: []`,
    `triaged_at: 2026-05-13T00:00:00Z`,
    `source: triage`,
  ];
  await writeFile(
    join(root, "docs/cycle/issues/todo", `${id}.md`),
    `---\n${fmLines.join("\n")}\n---\n\n${title}\n`,
    "utf8",
  );
  const row: Record<string, unknown> = {
    id,
    title,
    status,
    attempt,
    depends_on: [],
    triaged_at: "2026-05-13T00:00:00Z",
  };
  if (cycleId !== null) row.cycle_id = cycleId;
  await appendFile(join(root, ".cycle/tbd.jsonl"), JSON.stringify(row) + "\n", "utf8");
}

async function seedLogInFlight(
  root: string,
  cycleId: string,
  issueId: string,
  workflow: string,
  title: string,
  completed: string[] = [],
): Promise<void> {
  await mkdir(join(root, ".cycle"), { recursive: true });
  const lines = [
    JSON.stringify({ ts: "2026-05-13T00:00:00.000Z", event: "engine.start" }),
    JSON.stringify({
      ts: "2026-05-13T00:00:01.000Z",
      event: "cycle.start",
      cycle_id: cycleId,
      workflow,
      title,
      issue_id: issueId,
    }),
  ];
  for (const step of completed) {
    lines.push(JSON.stringify({
      ts: "2026-05-13T00:00:02.000Z",
      event: "step.start",
      cycle_id: cycleId,
      step,
    }));
    lines.push(JSON.stringify({
      ts: "2026-05-13T00:00:03.000Z",
      event: "step.end",
      cycle_id: cycleId,
      step,
      status: "ok",
    }));
  }
  await writeFile(join(root, ".cycle/log.jsonl"), lines.join("\n") + "\n", "utf8");
}

function parseEvents(text: string): Array<Record<string, unknown>> {
  return text.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
}

test("resume: skips completed steps and runs only remaining ones", async () => {
  const distPath = await ensureDist();
  const { originRoot, workRoot } = await setupRepoWithOrigin();
  try {
    await mkdir(join(workRoot, ".cycle"), { recursive: true });
    await writeWorkflows(workRoot);
    await writeStepScripts(workRoot);
    await seedTodo(workRoot, "alpha", "first task");
    // Pre-create cycle branch so checkoutCycleBranch succeeds.
    gitSync(workRoot, ["checkout", "-b", "cycle/feature/first-task"]);
    gitSync(workRoot, ["checkout", "main"]);
    await seedLogInFlight(workRoot, "0042", "alpha", "feature", "first task", ["spec"]);

    // Pre-create artifact dir + SPEC.md as if prior cycle wrote it.
    const artifactDir = join(workRoot, "docs/cycle/0042-feature-first-task");
    await mkdir(artifactDir, { recursive: true });
    await writeFile(join(artifactDir, "SPEC.md"), "ORIGINAL_SPEC", "utf8");

    const r = spawnSync("node", [distPath, "run", "--skip-preflight"], {
      cwd: workRoot,
      encoding: "utf8",
      env: { ...process.env, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, 0, `cycle exit ${r.status}\nstderr: ${r.stderr}`);

    const events = parseEvents(await readFile(join(workRoot, ".cycle/log.jsonl"), "utf8"));
    const eventTypes = events.map((e) => e.event);
    assert.equal(eventTypes.filter((t) => t === "engine.resume").length, 1, "engine.resume emitted once");
    assert.equal(eventTypes.filter((t) => t === "cycle.resume").length, 1, "cycle.resume emitted once");
    const engineResume = events.find((e) => e.event === "engine.resume") as Record<string, unknown>;
    assert.equal(engineResume.cycle_id, "0042");
    assert.equal(engineResume.from_step, "build");
    assert.deepEqual(engineResume.completed_steps, ["spec"]);

    const cycleResume = events.find((e) => e.event === "cycle.resume") as Record<string, unknown>;
    assert.equal(cycleResume.start_step_index, 1);

    // step.start for spec must NOT appear after engine.resume (spec was completed).
    const resumeIdx = events.findIndex((e) => e.event === "engine.resume");
    const newStepStarts = events.slice(resumeIdx).filter((e) => e.event === "step.start").map((e) => e.step);
    assert.ok(!newStepStarts.includes("spec"), `spec must not re-run; got ${JSON.stringify(newStepStarts)}`);
    assert.ok(newStepStarts.includes("build"), "build must run");
    assert.ok(newStepStarts.includes("verify"), "verify must run");

    // SPEC.md preserved (resume didn't overwrite).
    const spec = await readFile(join(artifactDir, "SPEC.md"), "utf8");
    assert.equal(spec, "ORIGINAL_SPEC");

    // queue.drained outcome:ok for the resumed cycle.
    const drained = events.find((e) => e.event === "queue.drained" && e.cycle_id === "0042") as Record<string, unknown>;
    assert.equal(drained?.outcome, "ok");
  } finally {
    await rm(originRoot, { recursive: true, force: true });
    await rm(workRoot, { recursive: true, force: true });
  }
});

test("resume: row mismatch emits warning and falls through (no cycle.resume)", async () => {
  const distPath = await ensureDist();
  const { originRoot, workRoot } = await setupRepoWithOrigin();
  try {
    await mkdir(join(workRoot, ".cycle"), { recursive: true });
    await writeWorkflows(workRoot);
    await writeStepScripts(workRoot);
    // log claims cycle for issue "foo" is in-flight, but tbd.jsonl is empty.
    await seedLogInFlight(workRoot, "0099", "foo", "feature", "missing one");

    const r = spawnSync("node", [distPath, "run", "--skip-preflight"], {
      cwd: workRoot,
      encoding: "utf8",
      env: { ...process.env, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, 0, `cycle exit ${r.status}\nstderr: ${r.stderr}`);

    const events = parseEvents(await readFile(join(workRoot, ".cycle/log.jsonl"), "utf8"));
    const warn = events.find((e) => e.event === "engine.warning" && e.reason === "resume_row_mismatch") as Record<string, unknown>;
    assert.ok(warn, "resume_row_mismatch warning expected");
    assert.equal(warn.cycle_id, "0099");
    assert.equal(warn.issue_id, "foo");
    assert.equal(warn.row_status, "missing");

    assert.ok(!events.find((e) => e.event === "cycle.resume"), "no cycle.resume on mismatch");
    assert.ok(!events.find((e) => e.event === "engine.resume"), "no engine.resume on mismatch");
  } finally {
    await rm(originRoot, { recursive: true, force: true });
    await rm(workRoot, { recursive: true, force: true });
  }
});

test("resume: fresh start when last cycle.end is ok (no resume events)", async () => {
  const distPath = await ensureDist();
  const { originRoot, workRoot } = await setupRepoWithOrigin();
  try {
    await mkdir(join(workRoot, ".cycle"), { recursive: true });
    await writeWorkflows(workRoot);
    await writeStepScripts(workRoot);
    await mkdir(join(workRoot, ".cycle"), { recursive: true });
    const lines = [
      JSON.stringify({ ts: "2026-05-13T00:00:00.000Z", event: "engine.start" }),
      JSON.stringify({ ts: "2026-05-13T00:00:01.000Z", event: "cycle.start", cycle_id: "0001", workflow: "feature", title: "x", issue_id: "x" }),
      JSON.stringify({ ts: "2026-05-13T00:00:02.000Z", event: "cycle.end", cycle_id: "0001", status: "ok" }),
      JSON.stringify({ ts: "2026-05-13T00:00:03.000Z", event: "engine.stop", status: "ok", dry_run: false, cycles_processed: 1 }),
    ];
    await writeFile(join(workRoot, ".cycle/log.jsonl"), lines.join("\n") + "\n", "utf8");

    const r = spawnSync("node", [distPath, "run", "--skip-preflight"], {
      cwd: workRoot,
      encoding: "utf8",
      env: { ...process.env, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, 0, `cycle exit ${r.status}\nstderr: ${r.stderr}`);

    const events = parseEvents(await readFile(join(workRoot, ".cycle/log.jsonl"), "utf8"));
    assert.ok(!events.find((e) => e.event === "cycle.resume"));
    assert.ok(!events.find((e) => e.event === "engine.resume"));
  } finally {
    await rm(originRoot, { recursive: true, force: true });
    await rm(workRoot, { recursive: true, force: true });
  }
});

test("resume: fresh start when last cycle.end is failed (no resume events)", async () => {
  const distPath = await ensureDist();
  const { originRoot, workRoot } = await setupRepoWithOrigin();
  try {
    await mkdir(join(workRoot, ".cycle"), { recursive: true });
    await writeWorkflows(workRoot);
    await writeStepScripts(workRoot);
    const lines = [
      JSON.stringify({ ts: "2026-05-13T00:00:00.000Z", event: "engine.start" }),
      JSON.stringify({ ts: "2026-05-13T00:00:01.000Z", event: "cycle.start", cycle_id: "0001", workflow: "feature", title: "x", issue_id: "x" }),
      JSON.stringify({ ts: "2026-05-13T00:00:02.000Z", event: "cycle.end", cycle_id: "0001", status: "failed", failing_step: "build" }),
    ];
    await writeFile(join(workRoot, ".cycle/log.jsonl"), lines.join("\n") + "\n", "utf8");

    const r = spawnSync("node", [distPath, "run", "--skip-preflight"], {
      cwd: workRoot,
      encoding: "utf8",
      env: { ...process.env, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, 0, `cycle exit ${r.status}\nstderr: ${r.stderr}`);

    const events = parseEvents(await readFile(join(workRoot, ".cycle/log.jsonl"), "utf8"));
    assert.ok(!events.find((e) => e.event === "cycle.resume"));
    assert.ok(!events.find((e) => e.event === "engine.resume"));
  } finally {
    await rm(originRoot, { recursive: true, force: true });
    await rm(workRoot, { recursive: true, force: true });
  }
});

test("resume: resumed cycle fails non-terminally → main loop re-pops, restarts, then halts on max_cycle_attempts", async () => {
  const distPath = await ensureDist();
  const { originRoot, workRoot } = await setupRepoWithOrigin();
  try {
    await mkdir(join(workRoot, ".cycle"), { recursive: true });
    // max_cycle_attempts:3 (default), max_consecutive_failures:2 (default) so the
    // halt is driven by attempt exhaustion, not the consecutive-failure threshold.
    await writeWorkflows(workRoot);
    // build.sh exits 1 on every call → every attempt fails until attempts are spent.
    await writeStepScripts(workRoot, { failStep: "build" });
    await seedTodo(workRoot, "alpha", "first task", { attempt: 0 });
    gitSync(workRoot, ["checkout", "-b", "cycle/feature/first-task"]);
    gitSync(workRoot, ["checkout", "main"]);
    await seedLogInFlight(workRoot, "0042", "alpha", "feature", "first task", ["spec"]);

    const r = spawnSync("node", [distPath, "run", "--skip-preflight"], {
      cwd: workRoot,
      encoding: "utf8",
      env: { ...process.env, CYCLE_BASE: "main" },
    });
    // Attempts exhausted (max_cycle_attempts:3) → engine halts, exit 1.
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\nstderr: ${r.stderr}`);

    const events = parseEvents(await readFile(join(workRoot, ".cycle/log.jsonl"), "utf8"));

    // The resume→main-loop handoff works: the in-flight cycle resumes, fails
    // non-terminally (retry-drain), and the MAIN loop re-pops the same row.
    assert.ok(events.find((e) => e.event === "engine.resume"), "engine.resume emitted");
    assert.ok(events.find((e) => e.event === "cycle.resume"), "cycle.resume emitted");

    const drained = events.filter((e) => e.event === "queue.drained");
    // Attempt 0 (resume): retry. Attempt 1 (main-loop re-pop): retry. Attempt 2
    // (main-loop re-pop): terminal — attempts spent.
    assert.equal(drained.length, 3, `expected 3 drains, got ${JSON.stringify(drained.map((d) => d.outcome))}`);
    assert.equal(drained[0].outcome, "retry");
    assert.equal(drained[1].outcome, "retry");
    assert.equal(drained[2].outcome, "terminal");

    // The main-loop retry tears down + restarts the cycle clean (cycle.restart),
    // rather than the old resume-style retry-drain-only handling. The resume path
    // (attempt 0→1) does NOT emit cycle.restart; only the in-budget main-loop
    // retry (attempt 1→2) does, so exactly one cycle.restart fires.
    const restarts = events.filter((e) => e.event === "cycle.restart");
    assert.equal(restarts.length, 1, "exactly one main-loop cycle.restart");
    assert.equal((restarts[0] as Record<string, unknown>).cycle_id, "0042");
    assert.equal((restarts[0] as Record<string, unknown>).issue_id, "alpha");
    assert.equal((restarts[0] as Record<string, unknown>).attempt, 2);
    assert.equal((restarts[0] as Record<string, unknown>).failing_step, "build");

    // Eventually halts with exactly one max_cycle_attempts_exhausted (cardinality-pin).
    const halts = events.filter(
      (e) => e.event === "engine.halted" && (e as Record<string, unknown>).reason === "max_cycle_attempts_exhausted",
    );
    assert.equal(halts.length, 1, "exactly one engine.halted{max_cycle_attempts_exhausted}");
    const halt = halts[0] as Record<string, unknown>;
    assert.equal(halt.cycle_id, "0042");
    assert.equal(halt.issue_id, "alpha");
    assert.equal(halt.attempts, 3, "halt reports 3 attempts spent");
    assert.equal(halt.failing_step, "build");
    // No consecutive-failures halt — the single terminal failure is under threshold 2.
    assert.ok(
      !events.find((e) => e.event === "engine.halted" && (e as Record<string, unknown>).reason === "max_consecutive_failures"),
      "no max_consecutive_failures halt",
    );

    const stops = events.filter((e) => e.event === "engine.stop");
    const stop = stops[stops.length - 1] as Record<string, unknown>;
    assert.equal(stop?.status, "halted");
    assert.equal(stop?.reason, "max_cycle_attempts_exhausted");

    // Row drained to failed/ terminally; queue is empty.
    const tbd = await readFile(join(workRoot, ".cycle/tbd.jsonl"), "utf8");
    assert.equal(tbd.trim(), "", "row drained terminally");
    const failedBody = await readFile(join(workRoot, "docs/cycle/issues/failed/alpha.md"), "utf8");
    assert.ok(/failed_step:\s*['"]?build['"]?/.test(failedBody), "failed_step:build present");
    assert.ok(/failed_attempts:\s*3/.test(failedBody), "failed_attempts:3 present");
  } finally {
    await rm(originRoot, { recursive: true, force: true });
    await rm(workRoot, { recursive: true, force: true });
  }
});

test("resume: resumed cycle fails on final attempt drains terminally", async () => {
  const distPath = await ensureDist();
  const { originRoot, workRoot } = await setupRepoWithOrigin();
  try {
    await mkdir(join(workRoot, ".cycle"), { recursive: true });
    // threshold 1 so the single terminal failure halts the engine.
    await writeWorkflows(workRoot, { maxConsecutiveFailures: 1 });
    await writeStepScripts(workRoot, { failStep: "build" });
    // attempt:2 + max_cycle_attempts:3 → terminal on this failure (attempt+1 == max).
    await seedTodo(workRoot, "alpha", "first task", { attempt: 2 });
    gitSync(workRoot, ["checkout", "-b", "cycle/feature/first-task"]);
    gitSync(workRoot, ["checkout", "main"]);
    await seedLogInFlight(workRoot, "0042", "alpha", "feature", "first task", ["spec"]);

    const r = spawnSync("node", [distPath, "run", "--skip-preflight"], {
      cwd: workRoot,
      encoding: "utf8",
      env: { ...process.env, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\nstderr: ${r.stderr}`);

    const events = parseEvents(await readFile(join(workRoot, ".cycle/log.jsonl"), "utf8"));
    const drained = events.find((e) => e.event === "queue.drained" && e.cycle_id === "0042") as Record<string, unknown>;
    assert.equal(drained?.outcome, "terminal");

    const failedPath = join(workRoot, "docs/cycle/issues/failed/alpha.md");
    const failedBody = await readFile(failedPath, "utf8");
    assert.ok(/failed_at:\s*['"]?\d{4}-/.test(failedBody), "failed_at frontmatter present");
    assert.ok(/failed_step:\s*['"]?build['"]?/.test(failedBody), "failed_step:build present");
    assert.ok(/failed_attempts:\s*3/.test(failedBody), "failed_attempts:3 present");
  } finally {
    await rm(originRoot, { recursive: true, force: true });
    await rm(workRoot, { recursive: true, force: true });
  }
});

test("resume: workflow name not in workflows.yml emits resume_workflow_missing", async () => {
  const distPath = await ensureDist();
  const { originRoot, workRoot } = await setupRepoWithOrigin();
  try {
    await mkdir(join(workRoot, ".cycle"), { recursive: true });
    await writeWorkflows(workRoot);
    await writeStepScripts(workRoot);
    // todo without workflow in frontmatter so log's workflow ("ghost") wins resolution.
    await seedTodo(workRoot, "alpha", "first task", { includeWorkflowInFrontmatter: false });
    gitSync(workRoot, ["checkout", "-b", "cycle/ghost/first-task"]);
    gitSync(workRoot, ["checkout", "main"]);
    await seedLogInFlight(workRoot, "0042", "alpha", "ghost", "first task");

    const r = spawnSync("node", [distPath, "run", "--skip-preflight"], {
      cwd: workRoot,
      encoding: "utf8",
      env: { ...process.env, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, 0, `cycle exit ${r.status}\nstderr: ${r.stderr}`);

    const events = parseEvents(await readFile(join(workRoot, ".cycle/log.jsonl"), "utf8"));
    const warn = events.find((e) => e.event === "engine.warning" && e.reason === "resume_workflow_missing") as Record<string, unknown>;
    assert.ok(warn, "resume_workflow_missing warning expected");
    assert.equal(warn.workflow, "ghost");
    assert.ok(!events.find((e) => e.event === "engine.resume"), "no engine.resume");
    assert.ok(!events.find((e) => e.event === "cycle.resume"), "no cycle.resume");
  } finally {
    await rm(originRoot, { recursive: true, force: true });
    await rm(workRoot, { recursive: true, force: true });
  }
});

test("resume: row mismatch (status: pending) emits warning and falls through", async () => {
  const distPath = await ensureDist();
  const { originRoot, workRoot } = await setupRepoWithOrigin();
  try {
    await mkdir(join(workRoot, ".cycle"), { recursive: true });
    await writeWorkflows(workRoot);
    await writeStepScripts(workRoot);
    await seedTodo(workRoot, "foo", "missing one", { status: "pending", cycle_id: null });
    await seedLogInFlight(workRoot, "0099", "foo", "feature", "missing one");

    const r = spawnSync("node", [distPath, "run", "--skip-preflight"], {
      cwd: workRoot,
      encoding: "utf8",
      env: { ...process.env, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, 0, `cycle exit ${r.status}\nstderr: ${r.stderr}`);

    const events = parseEvents(await readFile(join(workRoot, ".cycle/log.jsonl"), "utf8"));
    const warn = events.find((e) => e.event === "engine.warning" && e.reason === "resume_row_mismatch") as Record<string, unknown>;
    assert.ok(warn, "resume_row_mismatch warning expected");
    assert.equal(warn.row_status, "pending");
    assert.ok(!events.find((e) => e.event === "cycle.resume"), "no cycle.resume on mismatch");
  } finally {
    await rm(originRoot, { recursive: true, force: true });
    await rm(workRoot, { recursive: true, force: true });
  }
});

test("resume: row mismatch (different cycle_id) emits warning and falls through", async () => {
  const distPath = await ensureDist();
  const { originRoot, workRoot } = await setupRepoWithOrigin();
  try {
    await mkdir(join(workRoot, ".cycle"), { recursive: true });
    await writeWorkflows(workRoot);
    await writeStepScripts(workRoot);
    // Row in_progress for cycle 9999, but log's in-flight cycle is 0099.
    await seedTodo(workRoot, "foo", "missing one", { cycle_id: "9999" });
    await seedLogInFlight(workRoot, "0099", "foo", "feature", "missing one");

    const r = spawnSync("node", [distPath, "run", "--skip-preflight"], {
      cwd: workRoot,
      encoding: "utf8",
      env: { ...process.env, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, 0, `cycle exit ${r.status}\nstderr: ${r.stderr}`);

    const events = parseEvents(await readFile(join(workRoot, ".cycle/log.jsonl"), "utf8"));
    const warn = events.find((e) => e.event === "engine.warning" && e.reason === "resume_row_mismatch") as Record<string, unknown>;
    assert.ok(warn, "resume_row_mismatch warning expected");
    assert.equal(warn.row_status, "in_progress");
    assert.equal(warn.row_cycle_id, "9999");
    assert.ok(!events.find((e) => e.event === "cycle.resume"), "no cycle.resume on mismatch");
  } finally {
    await rm(originRoot, { recursive: true, force: true });
    await rm(workRoot, { recursive: true, force: true });
  }
});

test("resume: base refresh failure emits warning and skips resume", async () => {
  const distPath = await ensureDist();
  const workRoot = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    gitSync(workRoot, ["init", "-b", "main"]);
    gitSync(workRoot, ["config", "user.email", "t@t"]);
    gitSync(workRoot, ["config", "user.name", "t"]);
    gitSync(workRoot, ["commit", "--allow-empty", "-m", "init"]);
    // No origin remote configured — pullBase will fail.
    await mkdir(join(workRoot, ".cycle"), { recursive: true });
    await writeWorkflows(workRoot);
    await writeStepScripts(workRoot);
    await seedTodo(workRoot, "alpha", "first task");
    gitSync(workRoot, ["checkout", "-b", "cycle/feature/first-task"]);
    gitSync(workRoot, ["checkout", "main"]);
    await seedLogInFlight(workRoot, "0042", "alpha", "feature", "first task");

    const r = spawnSync("node", [distPath, "run", "--skip-preflight"], {
      cwd: workRoot,
      encoding: "utf8",
      env: { ...process.env, CYCLE_BASE: "main" },
    });

    const events = parseEvents(await readFile(join(workRoot, ".cycle/log.jsonl"), "utf8"));
    const warn = events.find((e) => e.event === "engine.warning" && e.reason === "resume_base_refresh_failed");
    assert.ok(warn, "resume_base_refresh_failed warning expected");
    assert.ok(!events.find((e) => e.event === "cycle.resume"), "no cycle.resume after base failure");
    assert.ok(!events.find((e) => e.event === "engine.resume"), "no engine.resume after base failure");
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
});

test("halt: resume-terminal then main-loop cycle exhausts attempts → max_cycle_attempts halt", async () => {
  const distPath = await ensureDist();
  const { originRoot, workRoot } = await setupRepoWithOrigin();
  try {
    await mkdir(join(workRoot, ".cycle"), { recursive: true });
    // max_cycle_attempts:1 → the first failure of any cycle is terminal. The
    // resumed cycle (alpha) drains terminally (consecutiveFailures=1, under the
    // threshold of 2), then the main loop pops beta which also exhausts its single
    // attempt — under the NEW behavior the main-loop terminal path halts on
    // max_cycle_attempts_exhausted immediately, it does NOT keep going to
    // accumulate toward max_consecutive_failures.
    await writeWorkflows(workRoot, { maxConsecutiveFailures: 2, maxCycleAttempts: 1 });
    await writeStepScripts(workRoot, { failStep: "verify" });
    await seedTodo(workRoot, "alpha", "alpha task", { attempt: 0 });
    await seedTodo(workRoot, "beta", "beta task", { status: "pending", cycle_id: null });
    gitSync(workRoot, ["checkout", "-b", "cycle/feature/alpha-task"]);
    gitSync(workRoot, ["checkout", "main"]);
    await seedLogInFlight(workRoot, "0042", "alpha", "feature", "alpha task");

    const r = spawnSync("node", [distPath, "run", "--skip-preflight"], {
      cwd: workRoot,
      encoding: "utf8",
      env: { ...process.env, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\nstderr: ${r.stderr}`);

    const events = parseEvents(await readFile(join(workRoot, ".cycle/log.jsonl"), "utf8"));

    // The resumed cycle ran and drained terminally; the main loop then popped beta.
    assert.ok(events.find((e) => e.event === "engine.resume"), "engine.resume emitted");

    const drained = events.filter((e) => e.event === "queue.drained");
    assert.equal(drained.length, 2, `expected 2 drains, got ${JSON.stringify(drained.map((d) => d.outcome))}`);
    assert.equal(drained[0].outcome, "terminal", "resumed alpha drains terminally");
    assert.equal(drained[0].cycle_id, "0042");
    assert.equal(drained[1].outcome, "terminal", "main-loop beta drains terminally");
    assert.notEqual(drained[1].cycle_id, "0042", "beta gets a freshly-allocated cycle id");

    // The main-loop attempt-exhaustion halts with max_cycle_attempts_exhausted —
    // NOT max_consecutive_failures (the new behavior halts on the first
    // attempt-exhaustion rather than accumulating). Exactly one such halt.
    const attemptHalts = events.filter(
      (e) => e.event === "engine.halted" && (e as Record<string, unknown>).reason === "max_cycle_attempts_exhausted",
    );
    assert.equal(attemptHalts.length, 1, "exactly one engine.halted{max_cycle_attempts_exhausted}");
    const halt = attemptHalts[0] as Record<string, unknown>;
    assert.equal(halt.cycle_id, drained[1].cycle_id, "halt is for the main-loop beta cycle");
    assert.equal(halt.issue_id, "beta");
    assert.equal(halt.attempts, 1);
    assert.equal(halt.failing_step, "verify");
    assert.ok(
      !events.find((e) => e.event === "engine.halted" && (e as Record<string, unknown>).reason === "max_consecutive_failures"),
      "no max_consecutive_failures halt — the main loop halts on attempt-exhaustion first",
    );

    const stops = events.filter((e) => e.event === "engine.stop");
    const stop = stops[stops.length - 1] as Record<string, unknown>;
    assert.equal(stop?.status, "halted");
    assert.equal(stop?.reason, "max_cycle_attempts_exhausted");
  } finally {
    await rm(originRoot, { recursive: true, force: true });
    await rm(workRoot, { recursive: true, force: true });
  }
});
