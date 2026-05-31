import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle } from "../../src/engine/run-cycle.ts";

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

async function setupRepo(stepsBody: string, scripts: Array<{ name: string; body: string }>) {
  const root = await mkdtemp(join(tmpdir(), "cycle-dur-end-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);

  await mkdir(join(root, ".cycle/scripts"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), workflowYml(stepsBody), "utf8");
  for (const s of scripts) {
    const p = join(root, ".cycle/scripts", s.name);
    await writeFile(p, s.body, "utf8");
    await chmod(p, 0o755);
  }
  return root;
}

function stepEnds(log: string): Array<Record<string, unknown>> {
  return log.trim().split("\n")
    .filter(l => l.includes('"event":"step.end"'))
    .map(l => JSON.parse(l) as Record<string, unknown>);
}

// A deterministic clock that advances by a fixed delta on each call.
function fakeClock(start: number, deltaPerCall: number): () => number {
  let t = start;
  let first = true;
  return () => {
    if (first) { first = false; return t; }
    t += deltaPerCall;
    return t;
  };
}

test("bash step.end carries integer duration_ms >= 0 from injected clock", async () => {
  const root = await setupRepo(
    `      - name: ok
        agent: bash
        command: scripts/ok.sh
`,
    [{ name: "ok.sh", body: "#!/bin/bash\necho hi\nexit 0\n" }],
  );
  try {
    // First nowFn() call = stepStart (1000), second = emission (1000 + 250).
    const r = await runCycle(root, {
      issueId: "DUR-OK",
      title: "ok bash step",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
      nowFn: fakeClock(1000, 250),
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const ends = stepEnds(log);
    assert.equal(ends.length, 1);
    const d = ends[0].duration_ms;
    assert.equal(typeof d, "number");
    assert.ok(Number.isInteger(d as number), "duration_ms must be an integer");
    assert.equal(d, 250);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("failed bash step.end still carries duration_ms alongside stderr", async () => {
  const root = await setupRepo(
    `      - name: boom
        agent: bash
        command: scripts/boom.sh
`,
    [{ name: "boom.sh", body: "#!/bin/bash\necho oops >&2\nexit 1\n" }],
  );
  try {
    const r = await runCycle(root, {
      issueId: "DUR-BOOM",
      title: "boom bash step",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
      nowFn: fakeClock(0, 42),
    });
    assert.equal(r.status, "failed");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const ends = stepEnds(log);
    assert.equal(ends.length, 1);
    assert.equal(ends[0].status, "failed");
    assert.equal(ends[0].duration_ms, 42);
    assert.equal(ends[0].stderr, "oops\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("non-monotonic clock clamps duration_ms to 0 (never negative)", async () => {
  const root = await setupRepo(
    `      - name: ok
        agent: bash
        command: scripts/ok.sh
`,
    [{ name: "ok.sh", body: "#!/bin/bash\nexit 0\n" }],
  );
  try {
    // Clock goes backwards: start 5000, emission returns 4000 → end < start.
    let n = 0;
    const r = await runCycle(root, {
      issueId: "DUR-CLAMP",
      title: "clamp",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
      nowFn: () => (n++ === 0 ? 5000 : 4000),
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const ends = stepEnds(log);
    assert.equal(ends.length, 1);
    assert.equal(ends[0].duration_ms, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("skip_unless-miss step.end carries integer duration_ms >= 0", async () => {
  const root = await setupRepo(
    `      - name: maybe
        agent: bash
        command: scripts/ok.sh
        skip_unless: MUST-FIX.md
`,
    [{ name: "ok.sh", body: "#!/bin/bash\nexit 0\n" }],
  );
  try {
    // No artifactDir / MUST-FIX.md exists → the step is skipped before dispatch.
    const r = await runCycle(root, {
      issueId: "DUR-SKIP",
      title: "skip unless miss",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
      nowFn: fakeClock(2000, 33),
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const ends = stepEnds(log);
    assert.equal(ends.length, 1);
    assert.equal(ends[0].status, "skipped");
    assert.equal(ends[0].reason, "skip_unless_artifact_missing");
    const d = ends[0].duration_ms;
    assert.ok(Number.isInteger(d as number) && (d as number) >= 0, "skipped step.end duration_ms must be integer >= 0");
    assert.equal(d, 33);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("default real-clock duration_ms is a non-negative integer (no injection)", async () => {
  const root = await setupRepo(
    `      - name: ok
        agent: bash
        command: scripts/ok.sh
`,
    [{ name: "ok.sh", body: "#!/bin/bash\nexit 0\n" }],
  );
  try {
    const r = await runCycle(root, {
      issueId: "DUR-REAL",
      title: "real clock",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const ends = stepEnds(log);
    assert.equal(ends.length, 1);
    const d = ends[0].duration_ms as number;
    assert.equal(typeof d, "number");
    assert.ok(Number.isInteger(d) && d >= 0, "real-clock duration_ms must be integer >= 0");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
