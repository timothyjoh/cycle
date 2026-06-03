import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPreflight } from "../../src/engine/preflight.ts";
import type { CycleConfig } from "../../src/engine/workflow.ts";

// Hermetic: agent binaries are injected via CYCLE_CODEX_BIN as an ABSOLUTE path
// to a temp-dir fake (never a PATH-stub of a real agent name — buildChildEnv
// prepends node's bin dir, which would shadow a PATH stub). Each test sets the
// env var and clears it in finally.

type StepLike = { name: string; agent: string; command?: string };
function makeCfg(steps: StepLike[], triageAgent = "codex"): CycleConfig {
  return {
    engine: {
      max_consecutive_failures: 2,
      base_branch: "main",
      commit: { mode: "trunk", push: false },
    },
    triage: { agent: triageAgent, prompt: "prompts/triage.md", max_turns: 10 },
    workflows: [{ name: "feature", max_cycle_attempts: 1, steps: steps as never }],
  } as CycleConfig;
}

async function writeFake(dir: string, name: string, body: string): Promise<string> {
  const p = join(dir, name);
  await writeFile(p, body, "utf8");
  await chmod(p, 0o755);
  return p;
}

const PASS = "#!/bin/bash\nexit 0\n";
const FAIL = "#!/bin/bash\nexit 1\n";

test("preflight: clean pass returns ok:true with no failures or warnings", async () => {
  const bin = await mkdtemp(join(tmpdir(), "cycle-pf-bin-"));
  try {
    process.env.CYCLE_CODEX_BIN = await writeFake(bin, "codex", PASS);
    const cfg = makeCfg([{ name: "build", agent: "codex" }]);
    // procVersion undefined ⇒ exercises readProcVersion(); temp fakes live under
    // /tmp (not /mnt/c) so no shadow warning regardless of WSL.
    const r = runPreflight({ cfg, workflowName: "feature" });
    assert.equal(r.ok, true, JSON.stringify(r.failures));
    assert.equal(r.failures.length, 0);
    assert.equal(r.warnings.length, 0);
    assert.ok(r.checks.some((c) => c.kind === "agent" && c.name === "codex" && c.ok));
    assert.ok(r.checks.some((c) => c.kind === "tool" && c.name === "git" && c.ok));
    assert.ok(r.checks.some((c) => c.kind === "tool" && c.name === "bash" && c.ok));
  } finally {
    delete process.env.CYCLE_CODEX_BIN;
    await rm(bin, { recursive: true, force: true });
  }
});

test("preflight: missing agent binary (nonexistent override path) fails with that path", async () => {
  const bin = await mkdtemp(join(tmpdir(), "cycle-pf-bin-"));
  try {
    const missing = join(bin, "does-not-exist");
    process.env.CYCLE_CODEX_BIN = missing;
    const cfg = makeCfg([{ name: "build", agent: "codex" }]);
    const r = runPreflight({ cfg, workflowName: "feature", procVersion: null });
    assert.equal(r.ok, false);
    const f = r.failures.find((x) => x.kind === "agent" && x.name === "codex");
    assert.ok(f, "agent failure present");
    assert.equal(f!.resolvedPath, missing);
  } finally {
    delete process.env.CYCLE_CODEX_BIN;
    await rm(bin, { recursive: true, force: true });
  }
});

test("preflight: wrong-platform agent under shadowPrefix yields Windows-build fix wording", async () => {
  const bin = await mkdtemp(join(tmpdir(), "cycle-pf-bin-"));
  try {
    process.env.CYCLE_CODEX_BIN = await writeFake(bin, "codex", FAIL);
    const cfg = makeCfg([{ name: "build", agent: "codex" }]);
    // shadowPrefix = the temp bin dir so the resolved fake counts as "shadowed".
    const r = runPreflight({ cfg, workflowName: "feature", procVersion: null, shadowPrefix: bin });
    assert.equal(r.ok, false);
    const f = r.failures.find((x) => x.kind === "agent" && x.name === "codex");
    assert.ok(f);
    assert.match(f!.fix, /a Windows build missing the linux-x64 binary/);
    assert.match(f!.fix, /Install natively: npm i -g @openai\/codex@latest/);
  } finally {
    delete process.env.CYCLE_CODEX_BIN;
    await rm(bin, { recursive: true, force: true });
  }
});

test("preflight: wrong-platform agent NOT shadowed yields generic probe-failed fix", async () => {
  const bin = await mkdtemp(join(tmpdir(), "cycle-pf-bin-"));
  try {
    process.env.CYCLE_CODEX_BIN = await writeFake(bin, "codex", FAIL);
    const cfg = makeCfg([{ name: "build", agent: "codex" }]);
    const r = runPreflight({ cfg, workflowName: "feature", procVersion: null });
    assert.equal(r.ok, false);
    const f = r.failures.find((x) => x.kind === "agent" && x.name === "codex");
    assert.ok(f);
    assert.match(f!.fix, /`--version` probe failed \(exit 1\)/);
  } finally {
    delete process.env.CYCLE_CODEX_BIN;
    await rm(bin, { recursive: true, force: true });
  }
});

test("preflight: missing required tool (empty pathEnv) fails git", async () => {
  const bin = await mkdtemp(join(tmpdir(), "cycle-pf-bin-"));
  const empty = await mkdtemp(join(tmpdir(), "cycle-pf-empty-"));
  try {
    // Agent resolves via absolute override (unaffected by pathEnv); tools resolve
    // on the injected pathEnv, narrowed to a dir lacking git/bash. (Narrowing
    // process.env.PATH is not hermetic — buildChildEnv prepends node's bin dir.)
    process.env.CYCLE_CODEX_BIN = await writeFake(bin, "codex", PASS);
    const cfg = makeCfg([{ name: "build", agent: "codex" }]);
    const r = runPreflight({ cfg, workflowName: "feature", procVersion: null, pathEnv: empty });
    assert.equal(r.ok, false);
    const git = r.failures.find((x) => x.kind === "tool" && x.name === "git");
    assert.ok(git, "git tool failure present");
    assert.equal(git!.resolvedPath, null);
    assert.match(git!.fix, /git not found on PATH/);
  } finally {
    delete process.env.CYCLE_CODEX_BIN;
    await rm(bin, { recursive: true, force: true });
    await rm(empty, { recursive: true, force: true });
  }
});

test("preflight: unresolved bare-name agent (empty pathEnv, no override) fails with env-var fix", async () => {
  const empty = await mkdtemp(join(tmpdir(), "cycle-pf-empty-"));
  try {
    delete process.env.CYCLE_CODEX_BIN;
    const cfg = makeCfg([{ name: "build", agent: "codex" }]);
    const r = runPreflight({ cfg, workflowName: "feature", procVersion: null, pathEnv: empty });
    assert.equal(r.ok, false);
    const f = r.failures.find((x) => x.kind === "agent" && x.name === "codex");
    assert.ok(f);
    assert.equal(f!.resolvedPath, null);
    assert.match(f!.fix, /set CYCLE_CODEX_BIN to its path/);
  } finally {
    await rm(empty, { recursive: true, force: true });
  }
});

test("preflight: WSL + /mnt/c-shadowed agent emits exactly one wsl_shadow warning, stays ok", async () => {
  const bin = await mkdtemp(join(tmpdir(), "cycle-pf-bin-"));
  try {
    process.env.CYCLE_CODEX_BIN = await writeFake(bin, "codex", PASS);
    const cfg = makeCfg([{ name: "build", agent: "codex" }]);
    const r = runPreflight({
      cfg,
      workflowName: "feature",
      procVersion: "Linux 6.6 microsoft-standard-WSL2",
      shadowPrefix: bin,
    });
    assert.equal(r.ok, true, JSON.stringify(r.failures));
    assert.equal(r.warnings.filter((w) => w.kind === "wsl_shadow").length, 1);
    assert.equal(r.warnings[0].target, "codex");
    assert.match(r.warnings[0].message, /likely shadows a native Linux install/);
  } finally {
    delete process.env.CYCLE_CODEX_BIN;
    await rm(bin, { recursive: true, force: true });
  }
});

test("preflight: WSL + shadowed tool emits a wsl_shadow warning for the tool", async () => {
  const bin = await mkdtemp(join(tmpdir(), "cycle-pf-bin-"));
  try {
    // A temp dir holding fake bash/git becomes the resolution PATH; with that
    // dir as the shadowPrefix and WSL on, the resolved tools count as shadowed.
    await writeFake(bin, "bash", PASS);
    await writeFake(bin, "git", PASS);
    process.env.CYCLE_CODEX_BIN = await writeFake(bin, "codex", PASS);
    const cfg = makeCfg([{ name: "build", agent: "codex" }]);
    const r = runPreflight({
      cfg,
      workflowName: "feature",
      procVersion: "Linux microsoft WSL2",
      shadowPrefix: bin,
      pathEnv: bin,
    });
    assert.equal(r.ok, true, JSON.stringify(r.failures));
    const toolWarn = r.warnings.filter((w) => w.kind === "wsl_shadow" && (w.target === "git" || w.target === "bash"));
    assert.ok(toolWarn.length >= 1, "at least one tool shadow warning");
  } finally {
    delete process.env.CYCLE_CODEX_BIN;
    await rm(bin, { recursive: true, force: true });
  }
});

test("preflight: static tool detection picks up bare `diff`, skips script paths", async () => {
  const bin = await mkdtemp(join(tmpdir(), "cycle-pf-bin-"));
  try {
    process.env.CYCLE_CODEX_BIN = await writeFake(bin, "codex", PASS);
    const cfg = makeCfg([
      { name: "diffstep", agent: "bash", command: "diff a b" },
      { name: "verify", agent: "bash", command: "scripts/verify.sh" },
    ]);
    const r = runPreflight({ cfg, workflowName: "feature", procVersion: null });
    assert.ok(r.checks.some((c) => c.kind === "tool" && c.name === "diff"));
    assert.ok(!r.checks.some((c) => c.name === "scripts/verify.sh"));
  } finally {
    delete process.env.CYCLE_CODEX_BIN;
    await rm(bin, { recursive: true, force: true });
  }
});

test("preflight: unresolved workflow degrades to triage agent + bash/git only", async () => {
  const bin = await mkdtemp(join(tmpdir(), "cycle-pf-bin-"));
  try {
    process.env.CYCLE_CODEX_BIN = await writeFake(bin, "codex", PASS);
    const cfg = makeCfg([{ name: "build", agent: "codex" }], "codex");
    const r = runPreflight({ cfg, workflowName: "nonexistent", procVersion: null });
    // Only the triage agent (codex) is probed; no extra tools beyond bash/git.
    assert.ok(r.checks.some((c) => c.kind === "agent" && c.name === "codex"));
    const toolNames = r.checks.filter((c) => c.kind === "tool").map((c) => c.name).sort();
    assert.deepEqual(toolNames, ["bash", "git"]);
  } finally {
    delete process.env.CYCLE_CODEX_BIN;
    await rm(bin, { recursive: true, force: true });
  }
});

test("preflight: internal error is caught and surfaced as a single internal failure", async () => {
  // cfg.workflows undefined ⇒ findWorkflow's `.find` throws inside the body;
  // the outer try/catch converts it to one internal failure (no raw throw).
  const cfg = { triage: { agent: "codex" } } as unknown as CycleConfig;
  const r = runPreflight({ cfg, workflowName: "feature", procVersion: null });
  assert.equal(r.ok, false);
  assert.equal(r.failures.length, 1);
  assert.equal(r.failures[0].kind, "internal");
  assert.equal(r.failures[0].name, "preflight");
  assert.ok(typeof r.failures[0].fix === "string" && r.failures[0].fix.length > 0);
});
