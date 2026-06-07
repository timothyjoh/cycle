import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runInvariants, INVARIANTS, validateActiveChildRegistration } from "../../scripts/structural-invariants.mjs";

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
  // Lanes with a non-interactive-entrypoint argv pin carry the matching literal
  // so the count-based invariant (expected: 1) is satisfied against the stub:
  // codex→`exec`, opencode→`run`, pi→`--print` (all non-TTY stdin fixes).
  const argvPin: Record<string, string> = {
    codex: `const argv: string[] = ["exec"];\n`,
    opencode: `const argv: string[] = ["run"];\n`,
    pi: `const argv: string[] = ["--print"];\n`,
  };
  for (const [file, env, bin] of lanes) {
    const execLine = argvPin[file] ?? "";
    await writeFile(
      join(cwd, `src/engine/exec-${file}.ts`),
      `${execLine}const binary = process.env.CYCLE_${env}_BIN ?? "${bin}";\n`,
    );
  }
  for (const agent of ["codex", "gemini", "opencode", "auggie", "pi"]) {
    await writeFile(join(cwd, `tests/engine/exec-${agent}.test.ts`), "// hermetic stub: no PATH-stub here\n");
  }

  // Exec-lane active-child-registration invariant targets (cycle 0267): the two
  // spawning lanes must carry spawn( + both registry calls so the new relational
  // entries pass against the synthetic tree. (The 6 agent stubs above have no
  // spawn( and pass vacuously — no change needed.)
  for (const f of ["exec-spawn", "exec-bash"]) {
    await writeFile(
      join(cwd, `src/engine/${f}.ts`),
      `const child = spawn(bin, args);\nregisterActiveChild(child.pid);\nunregisterActiveChild(child.pid);\n`,
    );
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

test("structural-invariants: codex-exec invariant is present and passes against real exec-codex.ts", async () => {
  const entry = INVARIANTS.find(
    (i) => i.file === "src/engine/exec-codex.ts" && i.reason.includes("codex exec"),
  );
  assert.ok(entry, "codex-exec invariant must be registered");
  const cap = captureConsoleError();
  let failed: number;
  try {
    failed = await runInvariants([entry], process.cwd());
  } finally {
    cap.restore();
  }
  assert.equal(failed, 0);
});

test("structural-invariants: codex-exec invariant fails when the exec argv element is removed", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-si-codex-exec-fail-"));
  try {
    await mkdir(join(root, "src/engine"), { recursive: true });
    // Synthetic bare-`codex` lane: argv omits the "exec" element.
    await writeFile(
      join(root, "src/engine/exec-codex.ts"),
      `const argv: string[] = [];\nconst binary = process.env.CYCLE_CODEX_BIN ?? "codex";\n`,
    );
    const entry = INVARIANTS.find(
      (i) => i.file === "src/engine/exec-codex.ts" && i.reason.includes("codex exec"),
    );
    assert.ok(entry);
    const cap = captureConsoleError();
    let failed: number;
    try {
      failed = await runInvariants([entry], root);
    } finally {
      cap.restore();
    }
    assert.ok(failed >= 1);
    assert.ok(cap.lines.some((l) => l.includes("src/engine/exec-codex.ts")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validateActiveChildRegistration: no spawn( -> vacuous pass", () => {
  const res = validateActiveChildRegistration('const binary = "x";\n', "src/engine/exec-codex.ts");
  assert.equal(res.ok, true);
  assert.match(res.actual ?? "", /vacuous/);
});

test("validateActiveChildRegistration: spawn( paired with both registry calls -> pass", () => {
  const text = "const child = spawn(bin, args);\nregisterActiveChild(child.pid);\nunregisterActiveChild(child.pid);\n";
  const res = validateActiveChildRegistration(text, "src/engine/exec-spawn.ts");
  assert.equal(res.ok, true);
});

test("validateActiveChildRegistration: spawn( missing unregisterActiveChild -> fail naming file + call", () => {
  const text = "const child = spawn(bin, args);\nregisterActiveChild(child.pid);\n";
  const res = validateActiveChildRegistration(text, "src/engine/exec-spawn.ts");
  assert.equal(res.ok, false);
  assert.ok(res.message?.includes("src/engine/exec-spawn.ts"));
  assert.ok(res.message?.includes("unregisterActiveChild"));
  assert.ok(!res.message?.includes("registerActiveChild and"));
});

test("validateActiveChildRegistration: only unregisterActiveChild present -> fail lists registerActiveChild (anchor guard)", () => {
  // `unregisterActiveChild(` must NOT satisfy the registerActiveChild probe —
  // proves the \b anchor excludes the substring match.
  const text = "const child = spawn(bin, args);\nunregisterActiveChild(child.pid);\n";
  const res = validateActiveChildRegistration(text, "src/engine/exec-bash.ts");
  assert.equal(res.ok, false);
  assert.ok(res.message?.includes("registerActiveChild"));
  assert.ok(!res.message?.includes("unregisterActiveChild —"));
});

test("validateActiveChildRegistration: spawnSync( only -> vacuous pass (spawn anchor excludes spawnSync)", () => {
  const text = "const r = spawnSync(bin, args);\n";
  const res = validateActiveChildRegistration(text, "src/engine/exec-codex.ts");
  assert.equal(res.ok, true);
  assert.match(res.actual ?? "", /vacuous/);
});

test("structural-invariants: active-child invariant fails via runInvariants when a spawning lane drops a registry call", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-si-active-child-fail-"));
  try {
    await mkdir(join(root, "src/engine"), { recursive: true });
    // Synthetic lane: spawns but never unregisters its child.
    await writeFile(
      join(root, "src/engine/exec-spawn.ts"),
      "const child = spawn(bin, args);\nregisterActiveChild(child.pid);\n",
    );
    const entry = INVARIANTS.find(
      (i) => i.file === "src/engine/exec-spawn.ts" && i.reason.includes("active-child"),
    );
    assert.ok(entry, "active-child registration invariant must be registered for exec-spawn.ts");
    const cap = captureConsoleError();
    let failed: number;
    try {
      failed = await runInvariants([entry], root);
    } finally {
      cap.restore();
    }
    assert.ok(failed >= 1);
    assert.ok(cap.lines.some((l) => l.includes("src/engine/exec-spawn.ts") && l.includes("FAIL")));
    assert.ok(cap.lines.some((l) => l.includes("unregisterActiveChild")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("structural-invariants: active-child invariant present and passes against real exec-spawn.ts", async () => {
  const entry = INVARIANTS.find(
    (i) => i.file === "src/engine/exec-spawn.ts" && i.reason.includes("active-child"),
  );
  assert.ok(entry, "active-child registration invariant must be registered");
  const cap = captureConsoleError();
  let failed: number;
  try {
    failed = await runInvariants([entry], process.cwd());
  } finally {
    cap.restore();
  }
  assert.equal(failed, 0);
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
