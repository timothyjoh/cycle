import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle, formatFixGuardError } from "../../src/engine/run-cycle.ts";
import { slugify } from "../../src/issue/id.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error("git " + args.join(" ") + ": " + r.stderr);
  return r.stdout;
}

function workflowYml(): string {
  return [
    "engine:",
    "  max_consecutive_failures: 2",
    "  base_branch: main",
    "  commit:",
    "    mode: trunk",
    "    push: false",
    "triage:",
    "  agent: claudecode",
    "  prompt: prompts/triage.md",
    "  max_turns: 10",
    "workflows:",
    "  - name: feature",
    "    max_cycle_attempts: 3",
    "    steps:",
    "      - name: fix",
    "        agent: claudecode",
    "        prompt: prompts/fix.md",
    "        skip_unless: MUST-FIX.md",
  ].join("\n") + "\n";
}

async function setupRepo(fakeBody: string): Promise<{ root: string; bin: string }> {
  const root = await mkdtemp(join(tmpdir(), "cycle-fix-guard-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-fix-guard-bin-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src/stub.ts"), "export {};\n", "utf8");
  git(root, ["add", "src/stub.ts"]);
  git(root, ["commit", "-m", "init"]);
  await mkdir(join(root, ".cycle/prompts"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), workflowYml(), "utf8");
  await writeFile(join(root, ".cycle/prompts/fix.md"), "noop", "utf8");
  const fake = join(bin, "claude");
  await writeFile(fake, fakeBody, "utf8");
  await chmod(fake, 0o755);
  return { root, bin };
}

async function preSeedMustFix(root: string, title: string, content: string) {
  const slug = slugify(title);
  const artifactDir = join(root, "docs/cycle", "0001-feature-" + slug);
  await mkdir(artifactDir, { recursive: true });
  await writeFile(join(artifactDir, "MUST-FIX.md"), content, "utf8");
}

async function cleanup(root: string, bin: string) {
  await rm(root, { recursive: true, force: true });
  await rm(bin, { recursive: true, force: true });
}

const SHEBANG = "#!/bin/bash";

test("fix-guard: MUST-FIX absent -> step skipped -> ok", async () => {
  const fakeBody = [SHEBANG, "printf Fixed.", ""].join("\n");
  const { root, bin } = await setupRepo(fakeBody);
  try {
    const r = await runCycle(root, {
      issueId: "FG-ABSENT",
      title: "fix guard absent",
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"step\.end"[^\n]*"step":"fix","status":"skipped"/);
  } finally {
    await cleanup(root, bin);
  }
});

test("fix-guard: MUST-FIX with tasks + FIX non-empty -> ok", async () => {
  const title = "fix guard tasks non empty";
  const fakeBody = [SHEBANG, "printf 'fix\\n' >> src/stub.ts", "printf Fixed.", ""].join("\n");
  const { root, bin } = await setupRepo(fakeBody);
  try {
    await preSeedMustFix(root, title, ["- [ ] task 1", "- [ ] task 2", ""].join("\n"));
    const r = await runCycle(root, {
      issueId: "FG-NONEMPTY",
      title,
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"step\.end"[^\n]*"step":"fix","status":"ok"/);
  } finally {
    await cleanup(root, bin);
  }
});

test("fix-guard: MUST-FIX with tasks + FIX whitespace -> failed", async () => {
  const title = "fix guard tasks whitespace";
  const fakeBody = [SHEBANG, "echo", ""].join("\n");
  const { root, bin } = await setupRepo(fakeBody);
  try {
    await preSeedMustFix(root, title, ["- [ ] task 1", "* [ ] task 2", ""].join("\n"));
    const r = await runCycle(root, {
      issueId: "FG-WHITESPACE",
      title,
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.status === "failed" ? r.failingStep : null, "fix");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /"event":"step\.end"[^\n]*"step":"fix","status":"failed"/);
    assert.match(log, /fix step produced empty FIX\.md while MUST-FIX\.md has 2 task/);
    assert.match(log, /"event":"cycle\.end"[^\n]*"status":"failed","failing_step":"fix"/);
  } finally {
    await cleanup(root, bin);
  }
});

test("fix-guard: MUST-FIX with tasks + FIX empty -> failed", async () => {
  const title = "fix guard tasks empty";
  const fakeBody = [SHEBANG, "true", ""].join("\n");
  const { root, bin } = await setupRepo(fakeBody);
  try {
    await preSeedMustFix(root, title, ["- [ ] only task", ""].join("\n"));
    const r = await runCycle(root, {
      issueId: "FG-EMPTY",
      title,
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.status === "failed" ? r.failingStep : null, "fix");
    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    assert.match(log, /fix step produced empty FIX\.md while MUST-FIX\.md has 1 task/);
  } finally {
    await cleanup(root, bin);
  }
});

test("fix-guard: MUST-FIX prose only (no task lines) -> ok", async () => {
  const title = "fix guard prose only";
  const fakeBody = [SHEBANG, "printf 'fix\\n' >> src/stub.ts", ""].join("\n");
  const { root, bin } = await setupRepo(fakeBody);
  try {
    await preSeedMustFix(root, title, ["All issues resolved.", ""].join("\n"));
    const r = await runCycle(root, {
      issueId: "FG-PROSE",
      title,
      workflow: "feature",
      env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");
  } finally {
    await cleanup(root, bin);
  }
});

test("formatFixGuardError: stable greppable shape", () => {
  const out = formatFixGuardError("/abs/path/FIX.md", "/abs/path/MUST-FIX.md", 3);
  assert.match(out, /fix step produced empty FIX\.md while MUST-FIX\.md has 3 task\(s\)/);
  assert.ok(out.includes("/abs/path/FIX.md"), "should name FIX.md path");
  assert.ok(out.includes("/abs/path/MUST-FIX.md"), "should name MUST-FIX.md path");
  assert.ok(out.includes("3 task(s)"));
});
