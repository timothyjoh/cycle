import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, chmod, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle } from "../../src/engine/run-cycle.ts";
import { parseFrontmatter } from "../../src/engine/frontmatter.ts";

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

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function setupGitRepo(root: string): Promise<void> {
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
}

test("runCycle: successful reflection step ingests sharp_edges into raw/", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-refl-rc-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-refl-bin-"));
  try {
    await setupGitRepo(root);
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml(`      - name: reflection
        agent: claudecode
        prompt: prompts/reflection.md
`),
      "utf8",
    );
    await writeFile(join(root, ".cycle/prompts/reflection.md"), "irrelevant", "utf8");

    const payload = JSON.stringify({
      sharp_edges: [
        { title: "hidden coupling", body: "engine couples to step name.", priority_hint: 7 },
      ],
    }).replace(/'/g, `'\\''`);
    const fake = join(bin, "claude");
    await writeFile(fake, `#!/bin/bash\ncat <<'EOF'\n${payload}\nEOF\n`, "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "REFL-1",
      title: "reflect e2e",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const reflFile = join(root, "docs/cycle/issues/raw", `refl-${r.cycleId}-hidden-coupling.md`);
    assert.ok(await fileExists(reflFile), `expected ${reflFile} to exist`);
    const body = await readFile(reflFile, "utf8");
    const { fm } = parseFrontmatter(body);
    assert.equal(fm.source, "reflection");
    assert.equal(fm.priority_hint, 7);
    assert.equal(fm.title, "hidden coupling");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const lines = log.trim().split("\n");
    const surfacedIdx = lines.findIndex((l) => l.includes('"event":"reflection.surfaced"'));
    const summaryIdx = lines.findIndex((l) => l.includes('"event":"reflection.summary"'));
    const endIdx = lines.findIndex((l) => l.includes('"event":"cycle.end"'));
    assert.ok(surfacedIdx >= 0 && summaryIdx >= 0 && endIdx >= 0);
    assert.ok(surfacedIdx < summaryIdx, "surfaced precedes summary");
    assert.ok(summaryIdx < endIdx, "summary precedes cycle.end");
    assert.match(log, /"event":"cycle.end","cycle_id":"\d+","status":"ok"/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runCycle: empty sharp_edges array yields no raw file, only summary", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-refl-rc-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-refl-bin-"));
  try {
    await setupGitRepo(root);
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml(`      - name: reflection
        agent: claudecode
        prompt: prompts/reflection.md
`),
      "utf8",
    );
    await writeFile(join(root, ".cycle/prompts/reflection.md"), "noop", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, `#!/bin/bash\necho '{"sharp_edges":[]}'\n`, "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "REFL-1",
      title: "reflect empty",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const rawDir = join(root, "docs/cycle/issues/raw");
    const entries = await readdir(rawDir).catch(() => []);
    assert.equal(entries.filter((n) => n.startsWith("refl-")).length, 0);

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"reflection.summary".*"count":0/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runCycle: reflection step exit-non-zero is non-fatal; cycle.end ok; reflection.skipped emitted", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-refl-rc-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-refl-bin-"));
  try {
    await setupGitRepo(root);
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml(`      - name: reflection
        agent: claudecode
        prompt: prompts/reflection.md
`),
      "utf8",
    );
    await writeFile(join(root, ".cycle/prompts/reflection.md"), "boom", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, `#!/bin/bash\necho boom 1>&2\nexit 1\n`, "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "REFL-1",
      title: "reflect fail",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"reflection.skipped".*"reason":"exec_failed"/);
    assert.match(log, /"event":"cycle.end","cycle_id":"\d+","status":"ok"/);

    const rawDir = join(root, "docs/cycle/issues/raw");
    const entries = await readdir(rawDir).catch(() => []);
    assert.equal(entries.filter((n) => n.startsWith("refl-")).length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runCycle: malformed reflection stdout emits reflection.skipped parse_error; cycle.end ok", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-refl-rc-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-refl-bin-"));
  try {
    await setupGitRepo(root);
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(
      join(root, ".cycle/workflows.yml"),
      workflowYml(`      - name: reflection
        agent: claudecode
        prompt: prompts/reflection.md
`),
      "utf8",
    );
    await writeFile(join(root, ".cycle/prompts/reflection.md"), "junk", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, `#!/bin/bash\necho 'not json at all'\n`, "utf8");
    await chmod(fake, 0o755);

    const r = await runCycle(root, {
      issueId: "REFL-1",
      title: "reflect junk",
      workflow: "feature",
      env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"reflection.skipped".*"reason":"parse_error"/);
    assert.match(log, /"event":"cycle.end","cycle_id":"\d+","status":"ok"/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
