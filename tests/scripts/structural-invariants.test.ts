import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runInvariants } from "../../scripts/structural-invariants.mjs";

const SCRIPT = join(process.cwd(), "scripts/structural-invariants.mjs");
const FIXTURES = join(process.cwd(), "tests/fixtures/structural-invariants");

// Default cli stub carries the single sanctioned `consecutiveFailures += 1`
// occurrence so two-arg callers satisfy the cli single-implementation rule.
async function setup(cwd: string, content: string, cliContent = "// stub\nconsecutiveFailures += 1;\nawait haltIfResidue();\nawait haltIfResidue();\nawait haltIfResidue();\n") {
  await mkdir(join(cwd, "src/engine"), { recursive: true });
  await writeFile(join(cwd, "src/engine/triage.ts"), content);
  await writeFile(join(cwd, "src/cli.ts"), cliContent);
  await writeFile(join(cwd, "src/engine/commit-cycle.ts"), "// stub");

  // Agent-binary hermeticity invariant targets: each lane must carry its
  // CYCLE_<AGENT>_BIN override, and each per-agent exec test must not PATH-stub.
  await mkdir(join(cwd, "tests/engine"), { recursive: true });
  const lanes: Array<[string, string, string]> = [
    ["claudecode", "CLAUDE", "claude"],
    ["codex", "CODEX", "codex"],
    ["gemini", "GEMINI", "gemini"],
    ["opencode", "OPENCODE", "opencode"],
    ["auggie", "AUGGIE", "auggie"],
    ["pi", "PI", "pi"],
  ];
  for (const [file, env, bin] of lanes) {
    await writeFile(
      join(cwd, `src/engine/exec-${file}.ts`),
      `const binary = process.env.CYCLE_${env}_BIN ?? "${bin}";\n`,
    );
  }
  for (const agent of ["codex", "gemini", "opencode", "auggie", "pi"]) {
    await writeFile(join(cwd, `tests/engine/exec-${agent}.test.ts`), "// hermetic stub: no PATH-stub here\n");
  }
}

function run(cwd: string) {
  return spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" as const });
}

test("structural-invariants: violation fixture -> exit 1, stderr has file/reason/expected/actual", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-si-fail-"));
  try {
    const content = await readFile(join(FIXTURES, "triage-violation.ts"), "utf8");
    await setup(root, content);
    const result = run(root);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes("src/engine/triage.ts"));
    assert.match(result.stderr, /childIds/);
    assert.match(result.stderr, /expected 1/);
    assert.match(result.stderr, /got 2/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("structural-invariants: clean fixture -> exit 0, no stderr", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-si-pass-"));
  try {
    const content = await readFile(join(FIXTURES, "triage-clean.ts"), "utf8");
    await setup(root, content);
    const result = run(root);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("structural-invariants: cli bookkeeping re-inlined -> exit 1, stderr names src/cli.ts + reason + expected/got", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-si-cli-fail-"));
  try {
    const triage = await readFile(join(FIXTURES, "triage-clean.ts"), "utf8");
    const cli = await readFile(join(FIXTURES, "cli-violation.ts"), "utf8");
    await setup(root, triage, cli);
    const result = run(root);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes("src/cli.ts"));
    assert.match(result.stderr, /terminal-failure bookkeeping single-implementation/);
    assert.match(result.stderr, /expected 1/);
    assert.match(result.stderr, /got 2/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("structural-invariants: cli single-implementation layout -> exit 0, no stderr", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-si-cli-pass-"));
  try {
    const triage = await readFile(join(FIXTURES, "triage-clean.ts"), "utf8");
    const cli = await readFile(join(FIXTURES, "cli-clean.ts"), "utf8");
    await setup(root, triage, cli);
    const result = run(root);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("structural-invariants: residue arm/persist clean fixture -> exit 0, no stderr", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-si-residue-pass-"));
  try {
    const triage = await readFile(join(FIXTURES, "triage-clean.ts"), "utf8");
    const cli = await readFile(join(FIXTURES, "cli-residue-clean.ts"), "utf8");
    await setup(root, triage, cli);
    const result = run(root);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /ok -- src\/cli\.ts residue arm\/persist correspondence.*: 2 paired/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("structural-invariants: residue arm without persist -> exit 1, names src/cli.ts + arm line + arm/persist contract", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-si-residue-fail-"));
  try {
    const triage = await readFile(join(FIXTURES, "triage-clean.ts"), "utf8");
    const cli = await readFile(join(FIXTURES, "cli-residue-violation.ts"), "utf8");
    await setup(root, triage, cli);
    const result = run(root);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes("src/cli.ts"));
    assert.match(result.stderr, /residue arm\/persist/);
    assert.match(result.stderr, /persistResidue/);
    assert.match(result.stderr, /line \d+/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Captures console.error for the duration of a runInvariants call so the
// containment-branch diagnostics can be asserted in-process (no subprocess).
function captureConsoleError(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.join(" "));
  };
  return { lines, restore: () => { console.error = original; } };
}

test("runInvariants contains a throwing validate as a FAIL, not a silent pass", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-si-throw-"));
  try {
    await writeFile(join(root, "target.txt"), "anything\n");
    const cap = captureConsoleError();
    let failed: number;
    try {
      failed = await runInvariants(
        [{ file: "target.txt", validate: () => { throw new Error("boom"); }, reason: "throwing predicate" }],
        root,
      );
    } finally {
      cap.restore();
    }
    assert.equal(failed, 1);
    assert.ok(cap.lines.some((l) => l.includes("predicate threw: boom")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runInvariants reports a malformed entry (no pattern or validate) as a FAIL", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-si-malformed-"));
  try {
    await writeFile(join(root, "target.txt"), "anything\n");
    const cap = captureConsoleError();
    let failed: number;
    try {
      failed = await runInvariants(
        [{ file: "target.txt", reason: "malformed: no pattern or validate" }],
        root,
      );
    } finally {
      cap.restore();
    }
    assert.equal(failed, 1);
    assert.ok(cap.lines.some((l) => l.includes("malformed invariant entry")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("structural-invariants: real repo emits residue arm/persist ok line", () => {
  const result = run(process.cwd());
  assert.equal(result.status, 0);
  assert.match(result.stdout, /ok -- src\/cli\.ts residue arm\/persist correspondence.*: 5 paired/);
});

test("structural-invariants: real repo root -> exit 0 (regression pin)", () => {
  const result = run(process.cwd());
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
});
