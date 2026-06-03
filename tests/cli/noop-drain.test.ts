import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, readdir, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = process.cwd();

async function ensureDist() {
  const distPath = join(REPO, "dist", "cycle.js");
  await readFile(distPath, "utf8");
  return distPath;
}

// A single-step `build` feature workflow driven by the claudecode agent, plus a
// triage agent (both resolve to the fake `claude` on PATH).
const buildYml = (maxConsecutive: number) => `engine:
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
    max_cycle_attempts: 3
    steps:
      - name: build
        agent: claudecode
        prompt: prompts/build.md
`;

// Fake claude: answer --version for preflight; otherwise locate the artifact
// dir via $CYCLE_ID, write a valid NOOP.md, print a non-empty BUILD.md summary,
// and make NO src/scripts/tests change ⇒ the engine resolves a no-op.
const noopFakeClaude = `#!/bin/bash
case "$1" in
  --version) echo "claude 0.0.0"; exit 0;;
esac
dir=$(ls -d docs/cycle/\${CYCLE_ID}-* 2>/dev/null | head -1)
printf 'reason: already-satisfied\\n\\n## Evidence\\n- src/engine/run-cycle.ts:653 already implements this\\n' > "$dir/NOOP.md"
printf '## Summary\\nThe SPEC is already satisfied; see src/engine/run-cycle.ts:653.\\n'
exit 0
`;

async function bootstrapRepo(root: string, bin: string, yml: string): Promise<void> {
  spawnSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: root, stdio: "ignore" });

  await mkdir(join(root, ".cycle/prompts"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), yml, "utf8");
  await writeFile(join(root, ".cycle/prompts/build.md"), "build", "utf8");
  await writeFile(join(root, ".cycle/prompts/triage.md"), "triage", "utf8");
  await mkdir(join(root, "docs/cycle/issues/inbox"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/done"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/failed"), { recursive: true });

  const fake = join(bin, "claude");
  await writeFile(fake, noopFakeClaude, "utf8");
  await chmod(fake, 0o755);
}

async function seedTodo(root: string, id: string, title: string): Promise<void> {
  await writeFile(
    join(root, "docs/cycle/issues/todo", `${id}.md`),
    `---\nid: ${id}\ntitle: "${title}"\nworkflow: feature\ndepends_on: []\ntriaged_at: 2026-05-13T00:00:00Z\nsource: triage\n---\n\n${title}\n`,
    "utf8",
  );
  await appendFile(
    join(root, ".cycle/tbd.jsonl"),
    JSON.stringify({ id, title, status: "pending", attempt: 0, depends_on: [], triaged_at: "2026-05-13T00:00:00Z" }) + "\n",
    "utf8",
  );
}

test("noop supervisor: issue lands in done/ (not failed/), engine does not halt", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-noop-drain-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-noop-drain-bin-"));
  try {
    const dist = await ensureDist();
    // max_consecutive_failures: 1 — if a no-op were (wrongly) counted as a
    // failure, two of them would halt the engine. They must not.
    await bootstrapRepo(root, bin, buildYml(1));
    await seedTodo(root, "moot-a", "moot task a");
    await seedTodo(root, "moot-b", "moot task b");

    const r = spawnSync("node", [dist, "run"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: bin + ":" + (process.env.PATH || "") },
    });
    assert.equal(r.status, 0, `run should exit 0 (no halt), got ${r.status}\n${r.stderr}`);

    const doneFiles = await readdir(join(root, "docs/cycle/issues/done"));
    assert.equal(doneFiles.length, 2, "both moot issues should be in done/");
    const failedFiles = await readdir(join(root, "docs/cycle/issues/failed"));
    assert.equal(failedFiles.length, 0, "nothing should land in failed/");
    const todoFiles = await readdir(join(root, "docs/cycle/issues/todo"));
    assert.equal(todoFiles.length, 0, "todo/ drained");

    const queue = await readFile(join(root, ".cycle/tbd.jsonl"), "utf8");
    assert.equal(queue.trim(), "", "queue empty");

    // done file carries the no-op frontmatter stamps.
    const body = await readFile(join(root, "docs/cycle/issues/done", "moot-a.md"), "utf8");
    assert.match(body, /^noop_at:/m);
    assert.match(body, /^noop_reason: already-satisfied$/m);
    assert.match(body, /^noop_step: build$/m);

    const events = (await readFile(join(root, ".cycle/log.jsonl"), "utf8"))
      .trim().split("\n").map((l) => JSON.parse(l));

    const drained = events.filter((e) => e.event === "queue.drained");
    assert.equal(drained.length, 2);
    assert.ok(drained.every((e) => e.outcome === "noop"), "both drains are no-op outcomes");
    assert.ok(drained.every((e) => e.reason === "already-satisfied"));

    // cycle.noop emitted per cycle; no terminal failure machinery fired.
    assert.equal(events.filter((e) => e.event === "cycle.noop").length, 2);
    assert.equal(events.filter((e) => e.event === "engine.halted").length, 0, "no halt");
    assert.equal(events.filter((e) => e.event === "issue.failed").length, 0, "no issue.failed");
    assert.equal(events.filter((e) => e.event === "queue.drained" && e.outcome === "terminal").length, 0);

    const stop = events.find((e) => e.event === "engine.stop");
    assert.equal(stop.status, "ok");
    assert.equal(stop.cycles_processed, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
