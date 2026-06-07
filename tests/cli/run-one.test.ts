import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { parseRunOneArgs, reapAndExit, type ReapDeps } from "../../src/cli/run-one.ts";

// A fake timer that captures the scheduled callback so tests can fire it on demand.
function fakeTimers() {
  const fns: Array<() => void> = [];
  const intervals: Array<() => void> = [];
  const cleared: unknown[] = [];
  return {
    fns,
    intervals,
    cleared,
    setTimeoutFn: (fn: () => void) => { fns.push(fn); return { unref() {} }; },
    setIntervalFn: (fn: () => void) => { intervals.push(fn); return { unref() {} }; },
    clearIntervalFn: (h: unknown) => { cleared.push(h); },
  };
}

function baseDeps(overrides: Partial<ReapDeps> = {}): { deps: ReapDeps; exits: number[]; kills: NodeJS.Signals[]; writes: string[] } {
  const exits: number[] = [];
  const kills: NodeJS.Signals[] = [];
  const writes: string[] = [];
  const deps: ReapDeps = {
    count: () => 1,
    killChildren: (sig) => { kills.push(sig); },
    anyAlive: () => true,
    exit: (c) => { exits.push(c); },
    write: (s) => { writes.push(s); },
    graceMs: 5000,
    ...overrides,
  };
  return { deps, exits, kills, writes };
}

test("reapAndExit exits immediately with no registered children (no kill, no write)", () => {
  const { deps, exits, kills, writes } = baseDeps({ count: () => 0 });
  reapAndExit("SIGTERM", 143, deps);
  assert.deepEqual(exits, [143]);
  assert.deepEqual(kills, []);
  assert.deepEqual(writes, []);
});

test("reapAndExit SIGTERMs children, then exits via the fast poll once they are gone", () => {
  const timers = fakeTimers();
  let alive = true;
  const { deps, exits, kills, writes } = baseDeps({
    anyAlive: () => alive,
    setTimeoutFn: timers.setTimeoutFn,
    setIntervalFn: timers.setIntervalFn,
    clearIntervalFn: timers.clearIntervalFn,
  });
  reapAndExit("SIGTERM", 143, deps);
  // Children SIGTERMed and a diagnostic line written; no exit yet (still alive).
  assert.deepEqual(kills, ["SIGTERM"]);
  assert.equal(writes.length, 1);
  assert.match(writes[0], /reaping 1 child group/);
  assert.deepEqual(exits, []);
  // First poll tick while alive: no exit.
  timers.intervals[0]();
  assert.deepEqual(exits, []);
  // Children die; next poll tick clears the interval and exits.
  alive = false;
  timers.intervals[0]();
  assert.deepEqual(exits, [143]);
  assert.equal(timers.cleared.length, 1, "poll interval cleared on exit");
});

test("reapAndExit SIGKILL backstop fires after grace for a child ignoring SIGTERM", () => {
  const timers = fakeTimers();
  const { deps, exits, kills } = baseDeps({
    anyAlive: () => true, // never dies on SIGTERM
    setTimeoutFn: timers.setTimeoutFn,
    setIntervalFn: timers.setIntervalFn,
    clearIntervalFn: timers.clearIntervalFn,
  });
  reapAndExit("SIGINT", 130, deps);
  assert.deepEqual(kills, ["SIGTERM"]);
  assert.deepEqual(exits, []);
  // Grace elapses: the kill timer SIGKILLs the group, clears the poll, and exits.
  timers.fns[0]();
  assert.deepEqual(kills, ["SIGTERM", "SIGKILL"]);
  assert.deepEqual(exits, [130]);
  assert.equal(timers.cleared.length, 1, "poll interval cleared by backstop");
});

const REPO = process.cwd();

async function ensureDist(): Promise<string> {
  const distPath = join(REPO, "dist", "cycle.js");
  await readFile(distPath, "utf8");
  return distPath;
}

const WORKFLOWS_YML = [
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
  "      - name: verify",
  "        agent: bash",
  "        command: scripts/verify.sh",
].join("\n");

async function bootstrapRepo(root: string, scriptExitCode: number): Promise<void> {
  spawnSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: root, stdio: "ignore" });
  await mkdir(join(root, ".cycle", "scripts"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), WORKFLOWS_YML, "utf8");
  const scriptPath = join(root, ".cycle/scripts/verify.sh");
  await writeFile(scriptPath, `#!/bin/bash\nexit ${scriptExitCode}\n`, "utf8");
  await chmod(scriptPath, 0o755);
}

test("run-one: exits 0 on successful cycle", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-run-one-"));
  try {
    await bootstrapRepo(root, 0);
    const r = spawnSync(
      "node",
      [dist, "run-one",
        "--cycle-id", "t001",
        "--issue-id", "test-issue",
        "--title", "test title",
        "--workflow", "feature",
        "--attempt", "0",
      ],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(r.status, 0, `expected exit 0, got ${r.status}\nstderr: ${r.stderr}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("run-one: exits 1 on failed cycle", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-run-one-"));
  try {
    await bootstrapRepo(root, 1);
    const r = spawnSync(
      "node",
      [dist, "run-one",
        "--cycle-id", "t002",
        "--issue-id", "test-issue",
        "--title", "test title",
        "--workflow", "feature",
        "--attempt", "0",
      ],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\nstderr: ${r.stderr}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("run-one: exits 3 on no-op cycle (build empty diff + valid NOOP.md)", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-run-one-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-run-one-bin-"));
  try {
    spawnSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
    spawnSync("git", ["config", "user.email", "t@t"], { cwd: root, stdio: "ignore" });
    spawnSync("git", ["config", "user.name", "t"], { cwd: root, stdio: "ignore" });
    spawnSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: root, stdio: "ignore" });
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
    const yml = [
      "engine:", "  max_consecutive_failures: 2", "  base_branch: main",
      "  commit:", "    mode: trunk", "    push: false",
      "triage:", "  agent: claudecode", "  prompt: prompts/triage.md", "  max_turns: 10",
      "workflows:", "  - name: feature", "    max_cycle_attempts: 3", "    steps:",
      "      - name: build", "        agent: claudecode", "        prompt: prompts/build.md",
    ].join("\n");
    await writeFile(join(root, ".cycle/workflows.yml"), yml, "utf8");
    await writeFile(join(root, ".cycle/prompts/build.md"), "build", "utf8");
    const fake = join(bin, "claude");
    await writeFile(fake,
      `#!/bin/bash\ndir=$(ls -d docs/cycle/\${CYCLE_ID}-* 2>/dev/null | head -1)\n` +
      `printf 'reason: already-satisfied\\n- src/engine/run-cycle.ts:653 done\\n' > "$dir/NOOP.md"\n` +
      `printf '## Summary\\nalready satisfied\\n'\nexit 0\n`, "utf8");
    await chmod(fake, 0o755);

    const r = spawnSync(
      "node",
      [dist, "run-one",
        "--cycle-id", "t-noop",
        "--issue-id", "noop-issue",
        "--title", "noop title",
        "--workflow", "feature",
        "--attempt", "0",
      ],
      { cwd: root, encoding: "utf8", env: { ...process.env, PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" } },
    );
    assert.equal(r.status, 3, `expected exit 3 (no-op), got ${r.status}\nstderr: ${r.stderr}`);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("run-one: exits 2 on missing required flag", async () => {
  const dist = await ensureDist();
  const r = spawnSync(
    "node",
    [dist, "run-one", "--issue-id", "x", "--title", "t", "--workflow", "f", "--attempt", "0"],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 2, `expected exit 2, got ${r.status}`);
});

test("run-one: spawnRunOne uses shell:false and process.execPath (no-shell regression)", async () => {
  const src = await readFile(join(REPO, "src", "cli.ts"), "utf8");
  assert.ok(src.includes("shell: false"), "spawnRunOne must have shell: false");
  assert.ok(src.includes("process.execPath"), "spawnRunOne must use process.execPath");
  assert.ok(!src.includes("spawn(\"node\""), "spawnRunOne must not hardcode node binary name");
});

test("run-one: all optional flags parse without exit 2", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-run-one-"));
  try {
    await bootstrapRepo(root, 0);
    const r = spawnSync(
      "node",
      [dist, "run-one",
        "--cycle-id", "t003",
        "--issue-id", "test-issue",
        "--title", "test title with spaces",
        "--workflow", "feature",
        "--attempt", "0",
        "--skip-completed-on-retry",
        "--base-branch", "main",
        "--resume-from-step", "0",
      ],
      { cwd: root, encoding: "utf8" },
    );
    assert.notEqual(r.status, 2, `must not exit 2 (flag parse error), got ${r.status}\nstderr: ${r.stderr}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parseRunOneArgs: all required flags produce correct typed object", () => {
  const result = parseRunOneArgs([
    "--cycle-id", "c001",
    "--issue-id", "i001",
    "--title", "my title",
    "--workflow", "feature",
    "--attempt", "2",
  ]);
  assert.deepEqual(result, {
    cycleId: "c001",
    issueId: "i001",
    title: "my title",
    workflow: "feature",
    attempt: 2,
    skipCompletedOnRetry: false,
    baseBranch: undefined,
    resumeFromStep: undefined,
  });
});

test("parseRunOneArgs: optional flags all parse correctly", () => {
  const result = parseRunOneArgs([
    "--cycle-id", "c001",
    "--issue-id", "i001",
    "--title", "title",
    "--workflow", "feature",
    "--attempt", "0",
    "--skip-completed-on-retry",
    "--base-branch", "main",
    "--resume-from-step", "3",
  ]);
  assert.equal(result.skipCompletedOnRetry, true);
  assert.equal(result.baseBranch, "main");
  assert.equal(result.resumeFromStep, 3);
  assert.equal(result.attempt, 0);
});

test("parseRunOneArgs: throws on missing --cycle-id", () => {
  assert.throws(
    () => parseRunOneArgs(["--issue-id", "x", "--title", "t", "--workflow", "f", "--attempt", "0"]),
    /--cycle-id is required/,
  );
});

test("parseRunOneArgs: throws on missing --title", () => {
  assert.throws(
    () => parseRunOneArgs(["--cycle-id", "c", "--issue-id", "i", "--workflow", "f", "--attempt", "0"]),
    /--title is required/,
  );
});

test("parseRunOneArgs: throws on non-integer --attempt", () => {
  assert.throws(
    () => parseRunOneArgs(["--cycle-id", "c", "--issue-id", "i", "--title", "t", "--workflow", "f", "--attempt", "abc"]),
    /--attempt must be integer/,
  );
});

test("parseRunOneArgs: throws on non-integer --resume-from-step", () => {
  assert.throws(
    () => parseRunOneArgs(["--cycle-id", "c", "--issue-id", "i", "--title", "t", "--workflow", "f", "--attempt", "0", "--resume-from-step", "x"]),
    /--resume-from-step must be integer/,
  );
});
