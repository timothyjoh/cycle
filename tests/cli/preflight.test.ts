import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expectExactlyOne } from "../helpers.ts";

const REPO = process.cwd();

async function ensureDist(): Promise<string> {
  const distPath = join(REPO, "dist", "cycle.js");
  await readFile(distPath, "utf8");
  return distPath;
}

// A feature workflow whose single agent step uses `codex`, so the preflight
// gate probes the codex binary (injectable via CYCLE_CODEX_BIN).
const WORKFLOW_YML = `engine:
  max_consecutive_failures: 2
  base_branch: main
  commit:
    mode: trunk
    push: false
triage:
  agent: codex
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    max_cycle_attempts: 1
    steps:
      - name: build
        agent: codex
        prompt: prompts/build.md
      - name: verify
        agent: bash
        command: scripts/verify.sh
`;

async function bootstrapRepo(root: string): Promise<void> {
  spawnSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: root, stdio: "ignore" });

  const cycleDir = join(root, ".cycle");
  const scriptsDir = join(cycleDir, "scripts");
  await mkdir(scriptsDir, { recursive: true });
  await writeFile(join(cycleDir, "workflows.yml"), WORKFLOW_YML, "utf8");
  const vs = join(scriptsDir, "verify.sh");
  await writeFile(vs, "#!/bin/bash\nexit 0\n", "utf8");
  await chmod(vs, 0o755);
  for (const d of ["inbox", "todo", "done", "blocked", "failed"]) {
    await mkdir(join(root, "docs/cycle/issues", d), { recursive: true });
  }
}

async function seedTodo(root: string, id: string, title: string): Promise<void> {
  const fm = [
    "---",
    `id: ${id}`,
    `title: "${title}"`,
    "workflow: feature",
    "depends_on: []",
    "triaged_at: 2026-05-13T00:00:00Z",
    "source: triage",
    "---",
    "",
    title,
    "",
  ].join("\n");
  await writeFile(join(root, "docs/cycle/issues/todo", `${id}.md`), fm, "utf8");
  const row = {
    id,
    title,
    status: "pending" as const,
    attempt: 0,
    depends_on: [],
    triaged_at: "2026-05-13T00:00:00Z",
  };
  await appendFile(join(root, ".cycle/tbd.jsonl"), JSON.stringify(row) + "\n", "utf8");
}

async function readEvents(root: string): Promise<Array<Record<string, unknown>>> {
  const body = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
  return body.trim().split("\n").map((l) => JSON.parse(l));
}

test("preflight CLI: missing agent binary halts before any cycle.start, exit 1", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-pf-cli-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-pf-cli-bin-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root);
    await seedTodo(root, "A", "a task");

    const r = spawnSync("node", [dist, "run"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, CYCLE_CODEX_BIN: join(bin, "does-not-exist") },
    });
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stderr}`);

    const events = await readEvents(root);
    const failed = expectExactlyOne(events, "engine.preflight.failed");
    const failures = failed.failures as Array<Record<string, unknown>>;
    assert.ok(failures.some((f) => f.name === "codex"), "codex failure recorded");
    const stop = events.filter((e) => e.event === "engine.stop").pop() as Record<string, unknown>;
    assert.equal(stop.reason, "preflight_failed");
    assert.equal(stop.status, "halted");
    assert.ok(!events.some((e) => e.event === "cycle.start"), "no cycle.start before halt");
    assert.ok(!events.some((e) => e.event === "engine.preflight.ok"), "no ok event on failure");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("preflight CLI: --skip-preflight emits neither preflight event", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-pf-cli-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-pf-cli-bin-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root);
    // No todo rows seeded → the engine proceeds past preflight to a clean idle stop.
    const r = spawnSync("node", [dist, "run", "--skip-preflight"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, CYCLE_CODEX_BIN: join(bin, "does-not-exist") },
    });
    // Bypassing the gate, the broken codex binary is never probed; the run does
    // not halt on preflight.
    const events = await readEvents(root);
    assert.ok(!events.some((e) => e.event === "engine.preflight.ok"));
    assert.ok(!events.some((e) => e.event === "engine.preflight.failed"));
    assert.ok(!events.some((e) => e.event === "engine.preflight.warning"));
    assert.notEqual(r.status, null);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("preflight CLI: healthy env emits exactly one engine.preflight.ok", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-pf-cli-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-pf-cli-bin-"));
  try {
    const dist = await ensureDist();
    await bootstrapRepo(root);
    const fake = join(bin, "codex");
    await writeFile(fake, "#!/bin/bash\nexit 0\n", "utf8");
    await chmod(fake, 0o755);
    // No todo rows → after a passing preflight the engine idles to a clean stop.
    const r = spawnSync("node", [dist, "run"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, CYCLE_CODEX_BIN: fake },
    });
    const events = await readEvents(root);
    assert.equal(
      events.filter((e) => e.event === "engine.preflight.ok").length,
      1,
      `expected one preflight.ok\n${r.stderr}`,
    );
    assert.ok(!events.some((e) => e.event === "engine.preflight.failed"));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
