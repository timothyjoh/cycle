import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runInvariants, INVARIANTS, validateActiveChildRegistration, validateDetachedSpawn, validateVerifyStepNames, deriveGateVerifyNames, extractVerifyStepNames } from "../../scripts/structural-invariants.mjs";

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

  // Exec-lane active-child-registration (cycle 0267) + detached-spawn (cycle
  // 0269) invariant targets: the two spawning lanes must carry spawn( + both
  // registry calls + detached: true so the relational entries pass against the
  // synthetic tree. (The 6 agent stubs above have no spawn( and pass vacuously —
  // no change needed.)
  for (const f of ["exec-spawn", "exec-bash"]) {
    await writeFile(
      join(cwd, `src/engine/${f}.ts`),
      `const child = spawn(bin, args, { detached: true });\nregisterActiveChild(child.pid);\nunregisterActiveChild(child.pid);\n`,
    );
  }

  // cycle 0275: the verify-step-name lockstep invariant reads
  // src/defaults/workflows.yml (the entry's file) and src/engine/run-cycle.ts
  // (the gate source, via process.cwd() = this synthetic root in the spawned run).
  await mkdir(join(cwd, "src/defaults"), { recursive: true });
  await writeFile(
    join(cwd, "src/defaults/workflows.yml"),
    "workflows:\n" +
      "  - name: feature\n" +
      "    steps:\n" +
      "      - { name: verify,       agent: bash, command: scripts/verify.sh }\n" +
      "      - { name: final_verify, agent: bash, command: scripts/verify.sh }\n",
  );
  await writeFile(
    join(cwd, "src/engine/run-cycle.ts"),
    "// Degenerate-verification gate (no false greens)\n" +
      'if (step.agent === "bash" && (step.name === "verify" || step.name === "final_verify")) {\n}\n',
  );
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

test("validateDetachedSpawn: spawn( with detached: true -> pass", () => {
  const res = validateDetachedSpawn("const c = spawn(bin, argv, { detached: true });\n", "src/engine/exec-spawn.ts");
  assert.equal(res.ok, true);
  assert.equal(res.actual, "spawn( with detached: true");
});

test("validateDetachedSpawn: no spawn( -> vacuous pass", () => {
  const res = validateDetachedSpawn("const x = 1;\n", "src/engine/exec-codex.ts");
  assert.equal(res.ok, true);
  assert.equal(res.actual, "no spawn( — vacuous");
});

test("validateDetachedSpawn: spawn( without detached: true -> fail naming file + remediation, does not throw", () => {
  let res: ReturnType<typeof validateDetachedSpawn> | undefined;
  assert.doesNotThrow(() => {
    res = validateDetachedSpawn("const c = spawn(bin, argv, { stdio: 'inherit' });\n", "src/engine/exec-x.ts");
  });
  assert.equal(res?.ok, false);
  assert.ok(res?.message?.includes("src/engine/exec-x.ts"));
  assert.ok(res?.message?.includes("detached: true"));
});

test("validateDetachedSpawn: spawnSync( only -> vacuous pass (spawn anchor excludes spawnSync)", () => {
  const res = validateDetachedSpawn("const r = spawnSync(bin, argv, { stdio: 'inherit' });\n", "src/engine/exec-codex.ts");
  assert.equal(res.ok, true);
  assert.equal(res.actual, "no spawn( — vacuous");
});

test("validateDetachedSpawn: whitespace tolerance in both probes -> pass", () => {
  const res = validateDetachedSpawn("spawn ( bin ); detached : true", "f.ts");
  assert.equal(res.ok, true);
});

test("structural-invariants: detached-spawn invariant fails via runInvariants when a spawning lane drops detached: true", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-si-detached-fail-"));
  try {
    await mkdir(join(root, "src/engine"), { recursive: true });
    // Synthetic lane: spawns but never passes detached: true.
    await writeFile(
      join(root, "src/engine/exec-x.ts"),
      "const child = spawn(bin, args, { stdio: 'inherit' });\n",
    );
    const cap = captureConsoleError();
    let failed: number;
    try {
      failed = await runInvariants(
        [{ file: "src/engine/exec-x.ts", validate: validateDetachedSpawn, reason: "detached-spawn" }],
        root,
      );
    } finally {
      cap.restore();
    }
    assert.equal(failed, 1);
    assert.ok(cap.lines.some((l) => l.includes("src/engine/exec-x.ts") && l.includes("FAIL")));
    assert.ok(cap.lines.some((l) => l.includes("detached: true")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("structural-invariants: detached-spawn invariant present and passes against real exec-spawn.ts", async () => {
  const entry = INVARIANTS.find(
    (i) => i.file === "src/engine/exec-spawn.ts" && i.reason.includes("detached-spawn"),
  );
  assert.ok(entry, "detached-spawn invariant must be registered for exec-spawn.ts");
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

// --- Verify-step-name / gate lockstep (cycle 0275) ---

const REAL_WF = join(process.cwd(), "src/defaults/workflows.yml");
const REAL_RC = join(process.cwd(), "src/engine/run-cycle.ts");

test("deriveGateVerifyNames: real run-cycle.ts -> {verify, final_verify}", async () => {
  const rc = await readFile(REAL_RC, "utf8");
  const res = deriveGateVerifyNames(rc);
  assert.equal(res.ok, true);
  assert.ok(res.ok && res.names.has("verify"));
  assert.ok(res.ok && res.names.has("final_verify"));
  // Exactly the gate's two literals — the window excludes the other
  // step.name === "…" comparisons elsewhere in run-cycle.ts.
  assert.equal(res.ok && res.names.size, 2);
});

test("deriveGateVerifyNames: no anchor -> ok:false (fail-closed)", () => {
  const res = deriveGateVerifyNames('if (step.name === "verify") {}\n');
  assert.equal(res.ok, false);
  assert.match(String(res.ok ? "" : res.message), /anchor/);
});

test("deriveGateVerifyNames: anchor but no step.name literals -> ok:false", () => {
  const res = deriveGateVerifyNames("// Degenerate-verification gate\nif (foo) {}\n");
  assert.equal(res.ok, false);
  assert.match(String(res.ok ? "" : res.message), /step\.name/);
});

test("deriveGateVerifyNames: comment-brace before the if is not the window boundary", () => {
  // The real comment carries `step.end{failed}`; the window must start at `if (`,
  // not at that comment brace, or zero literals would be captured.
  const text =
    "// Degenerate-verification gate: reuses step.end{failed} capture\n" +
    'if (step.agent === "bash" && (step.name === "verify" || step.name === "final_verify")) {\n}\n';
  const res = deriveGateVerifyNames(text);
  assert.equal(res.ok, true);
  assert.equal(res.ok && res.names.size, 2);
});

test("deriveGateVerifyNames: anchor with no following if -> ok:false (fail-closed)", () => {
  const res = deriveGateVerifyNames("// Degenerate-verification gate\nconst x = 1;\n");
  assert.equal(res.ok, false);
});

test("extractVerifyStepNames: real workflows.yml -> 5 attributed steps", async () => {
  const wf = await readFile(REAL_WF, "utf8");
  const res = extractVerifyStepNames(wf);
  assert.equal(res.ok, true);
  assert.ok(res.ok);
  if (res.ok) {
    assert.equal(res.steps.length, 5);
    const byWf = res.steps.map((s) => `${s.workflow}:${s.stepName}`);
    assert.ok(byWf.includes("feature:verify"));
    assert.ok(byWf.includes("feature:final_verify"));
    assert.ok(byWf.includes("document:verify"));
    assert.ok(byWf.includes("quickfix:verify"));
    assert.ok(byWf.includes("e2e-tests:verify"));
    // walkthrough_* bash steps (no command) are not extracted.
    assert.ok(!byWf.some((s) => s.includes("walkthrough")));
  }
});

test("extractVerifyStepNames: no workflows: block -> ok:false", () => {
  const res = extractVerifyStepNames("not: yaml\ncommand: scripts/verify.sh\n");
  assert.equal(res.ok, false);
  assert.match(String(res.ok ? "" : res.message), /workflows:/);
});

test("extractVerifyStepNames: verify.sh line with no resolvable name -> ok:false", () => {
  const text = "workflows:\n  - name: feature\n    steps:\n      - { command: scripts/verify.sh }\n";
  const res = extractVerifyStepNames(text);
  assert.equal(res.ok, false);
  assert.match(String(res.ok ? "" : res.message), /cannot resolve verify-script step/);
});

test("extractVerifyStepNames: verify.sh line with no preceding workflow -> ok:false", () => {
  const text = "workflows:\n  steps:\n      - { name: verify, command: scripts/verify.sh }\n";
  const res = extractVerifyStepNames(text);
  assert.equal(res.ok, false);
});

test("validateVerifyStepNames: real files (injected gate) -> ok:true", async () => {
  const wf = await readFile(REAL_WF, "utf8");
  const rc = await readFile(REAL_RC, "utf8");
  const res = validateVerifyStepNames(wf, "src/defaults/workflows.yml", { gateText: rc });
  assert.equal(res.ok, true);
  assert.match(res.actual ?? "", /5 verify step\(s\)/);
});

test("validateVerifyStepNames: renamed verify step -> ok:false naming workflow + step", async () => {
  const wf = await readFile(REAL_WF, "utf8");
  const rc = await readFile(REAL_RC, "utf8");
  const renamed = wf.replace("name: verify,", "name: verify_app,");
  const res = validateVerifyStepNames(renamed, "src/defaults/workflows.yml", { gateText: rc });
  assert.equal(res.ok, false);
  assert.match(String(res.ok ? "" : res.message), /feature/);
  assert.match(String(res.ok ? "" : res.message), /verify_app/);
});

test("validateVerifyStepNames: unparseable gate source -> ok:false", async () => {
  const wf = await readFile(REAL_WF, "utf8");
  const res = validateVerifyStepNames(wf, "src/defaults/workflows.yml", { gateText: "no gate here" });
  assert.equal(res.ok, false);
  assert.match(String(res.ok ? "" : res.message), /gate literals/);
});

test("validateVerifyStepNames: unparseable workflows text -> ok:false", async () => {
  const rc = await readFile(REAL_RC, "utf8");
  const res = validateVerifyStepNames("not yaml at all", "src/defaults/workflows.yml", { gateText: rc });
  assert.equal(res.ok, false);
  assert.match(String(res.ok ? "" : res.message), /workflows:/);
});

test("validateVerifyStepNames: missing gate source (no inject, cwd lacks file) -> ok:false naming path", async () => {
  // No gateText injected and process.cwd() in this scenario is a temp root with
  // no src/engine/run-cycle.ts — the read fails and is surfaced as ok:false.
  const root = await mkdtemp(join(tmpdir(), "cycle-si-verify-noread-"));
  const prev = process.cwd();
  try {
    process.chdir(root);
    const res = validateVerifyStepNames("workflows:\n", "src/defaults/workflows.yml");
    assert.equal(res.ok, false);
    assert.match(String(res.ok ? "" : res.message), /run-cycle\.ts/);
  } finally {
    process.chdir(prev);
    await rm(root, { recursive: true, force: true });
  }
});

test("validateVerifyStepNames: drift-coupling -> accepted set is derived, not hardcoded", () => {
  // Gate literals say only `verify_app`; a workflow whose step is verify_app passes.
  const driftGate =
    "// Degenerate-verification gate\n" + 'if (step.name === "verify_app") {\n}\n';
  const wf =
    "workflows:\n  - name: feature\n    steps:\n      - { name: verify_app, agent: bash, command: scripts/verify.sh }\n";
  const pass = validateVerifyStepNames(wf, "src/defaults/workflows.yml", { gateText: driftGate });
  assert.equal(pass.ok, true);
  // The SAME workflow against the real gate literals (verify/final_verify) fails —
  // proving the set tracks run-cycle.ts rather than being re-declared.
  const realGate =
    "// Degenerate-verification gate\n" +
    'if (step.name === "verify" || step.name === "final_verify") {\n}\n';
  const fail = validateVerifyStepNames(wf, "src/defaults/workflows.yml", { gateText: realGate });
  assert.equal(fail.ok, false);
  assert.match(String(fail.ok ? "" : fail.message), /verify_app/);
});

test("structural-invariants: verify-step-name lockstep entry present and passes via runInvariants against live repo", async () => {
  const entry = INVARIANTS.find((i) => i.reason.includes("verify-step-name lockstep"));
  assert.ok(entry, "verify-step-name lockstep invariant must be registered");
  const cap = captureConsoleError();
  let failed: number;
  try {
    failed = await runInvariants([entry], process.cwd());
  } finally {
    cap.restore();
  }
  assert.equal(failed, 0);
});

test("structural-invariants: verify-step-name lockstep fails via runInvariants on a renamed step", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-si-verify-rename-"));
  try {
    await mkdir(join(root, "src/defaults"), { recursive: true });
    await mkdir(join(root, "src/engine"), { recursive: true });
    await writeFile(
      join(root, "src/defaults/workflows.yml"),
      "workflows:\n" +
        "  - name: feature\n" +
        "    steps:\n" +
        "      - { name: verify_app, agent: bash, command: scripts/verify.sh }\n",
    );
    await writeFile(
      join(root, "src/engine/run-cycle.ts"),
      "// Degenerate-verification gate\n" +
        'if (step.name === "verify" || step.name === "final_verify") {\n}\n',
    );
    const entry = INVARIANTS.find((i) => i.reason.includes("verify-step-name lockstep"));
    assert.ok(entry);
    const cap = captureConsoleError();
    let failed: number;
    try {
      failed = await runInvariants([entry], root);
    } finally {
      cap.restore();
    }
    assert.equal(failed, 1);
    assert.ok(cap.lines.some((l) => l.includes("FAIL") && l.includes("verify_app") && l.includes("feature")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
