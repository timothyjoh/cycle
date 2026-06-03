import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = process.cwd();
const USAGE_SENTINEL = "cycle — issue-driven workflow engine";

// Argument-parse failures the bare-`cycle` / run path can surface, on either
// stream: `unknown command:` (src/cli/parse-args.ts) and Node's nodeParseArgs
// ERR_PARSE_ARGS_UNKNOWN_OPTION / "Unknown argument" family for unknown flags.
const PARSE_ERROR_SENTINELS = [
  "unknown command",
  "Unknown argument",
  "ERR_PARSE_ARGS_UNKNOWN_OPTION",
] as const;

async function ensureDist(): Promise<string> {
  const distPath = join(REPO, "dist", "cycle.js");
  await readFile(distPath, "utf8");
  return distPath;
}

const MINIMAL_WORKFLOW = `engine:
  base_branch: main
  commit:
    mode: trunk
    push: false
triage:
  agent: claudecode
  prompt: triage.md
  max_turns: 5
workflows:
  - name: feature
    steps: []
`;

async function bootstrapMinimal(root: string): Promise<void> {
  spawnSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: root, stdio: "ignore" });
  const cycleDir = join(root, ".cycle");
  await mkdir(cycleDir, { recursive: true });
  await writeFile(join(cycleDir, "workflows.yml"), MINIMAL_WORKFLOW, "utf8");
  for (const d of ["raw", "todo", "done", "blocked", "failed"]) {
    await mkdir(join(root, "docs/cycle/issues", d), { recursive: true });
  }
}

test("cycle help prints usage and exits 0", async () => {
  const dist = await ensureDist();
  const r = spawnSync("node", [dist, "help"], { encoding: "utf8" });
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}. stderr: ${r.stderr}`);
  assert.ok(r.stdout.includes(USAGE_SENTINEL), `expected sentinel in stdout: ${r.stdout}`);
});

test("cycle --help prints usage and exits 0", async () => {
  const dist = await ensureDist();
  const r = spawnSync("node", [dist, "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}. stderr: ${r.stderr}`);
  assert.ok(r.stdout.includes(USAGE_SENTINEL));
});

test("cycle run --help prints usage and exits 0", async () => {
  const dist = await ensureDist();
  const r = spawnSync("node", [dist, "run", "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}. stderr: ${r.stderr}`);
  assert.ok(r.stdout.includes(USAGE_SENTINEL));
});

test("usage output lists all six subcommands", async () => {
  const dist = await ensureDist();
  const r = spawnSync("node", [dist, "help"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  for (const cmd of ["run", "drop", "status", "triage", "cleanup", "help"]) {
    assert.ok(r.stdout.includes(cmd), `expected '${cmd}' in usage output`);
  }
});

test("usage output lists the compress-output subcommand", async () => {
  const dist = await ensureDist();
  const r = spawnSync("node", [dist, "help"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes("compress-output"), "expected 'compress-output' in usage output");
});

test("usage output lists the upgrade subcommand and all overwrite flags", async () => {
  const dist = await ensureDist();
  const r = spawnSync("node", [dist, "help"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  for (const s of [
    "cycle upgrade",
    "--overwrite-prompts",
    "--overwrite-workflows",
    "--overwrite-scripts",
    "--overwrite-all",
  ]) {
    assert.ok(r.stdout.includes(s), `expected '${s}' in usage output`);
  }
});

test("cycle default run drains and exits 0 with no argument-parse error", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-no-args-"));
  try {
    await bootstrapMinimal(root);
    // --skip-preflight keeps this hermetic: the default-run contract (exit 0, no
    // parse error) is independent of whether agent binaries are installed; the
    // pure no-args parsing is covered by the parse-args unit test.
    const r = spawnSync("node", [dist, "run", "--skip-preflight"], {
      cwd: root,
      encoding: "utf8",
      timeout: 30000,
    });
    // Stable public contract of a bare `cycle` invocation: it parses zero args
    // cleanly and exits 0. We intentionally do NOT string-match the internal
    // engine.start JSONL event in stdout — that coupled this test to both the
    // event encoding and the routing of structured events to stdout, so a
    // future change moving JSONL to stderr would silently pass while losing the
    // regression guard. Exit code + absence of a parse error are routing- and
    // encoding-independent.
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}. stderr: ${r.stderr}`);
    const combined = `${r.stdout}${r.stderr}`;
    for (const sentinel of PARSE_ERROR_SENTINELS) {
      assert.ok(
        !combined.includes(sentinel),
        `unexpected argument-parse error '${sentinel}' in output.\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
