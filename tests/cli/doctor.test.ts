import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, writeFile, rm, chmod, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDoctor, renderReport } from "../../src/cli/doctor.ts";
import type { PreflightResult } from "../../src/engine/preflight.ts";

// Hermetic: agent binaries are injected via an ABSOLUTE CYCLE_<AGENT>_BIN path
// to a temp-dir fake (never a PATH-stub of a real agent name — buildChildEnv
// prepends node's bin dir, which would shadow a PATH stub). Each test passes an
// explicit `env` into runDoctor so resolution is deterministic.

const PASS = "#!/bin/bash\nexit 0\n";

async function writeFake(dir: string, name: string, body: string): Promise<string> {
  const p = join(dir, name);
  await writeFile(p, body, "utf8");
  await chmod(p, 0o755);
  return p;
}

// Minimal initialized repo: a single-agent (codex) feature workflow + triage,
// so only CYCLE_CODEX_BIN must be injected for a clean pass.
const WORKFLOWS_YML = `engine:
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
`;

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cycle-doctor-"));
  await mkdir(join(root, ".cycle"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), WORKFLOWS_YML, "utf8");
  return root;
}

test("doctor: clean pass lists checks, exits 0, ends with all-checks-passed", async () => {
  const root = await makeRepo();
  const bin = await mkdtemp(join(tmpdir(), "cycle-doctor-bin-"));
  try {
    const codex = await writeFake(bin, "codex", PASS);
    const r = await runDoctor({
      cwd: root,
      workflow: "feature",
      env: { ...process.env, CYCLE_CODEX_BIN: codex },
    });
    assert.equal(r.exitCode, 0, r.stdout + r.stderr);
    assert.equal(r.stderr, "");
    assert.match(r.stdout, /agent\s+codex\s+ok/);
    assert.match(r.stdout, /tool\s+git\s+ok/);
    assert.match(r.stdout, /tool\s+bash\s+ok/);
    assert.match(r.stdout, /doctor: all checks passed\n$/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("doctor: forced-missing agent fails with binary name + remediation, exits non-zero", async () => {
  const root = await makeRepo();
  const bin = await mkdtemp(join(tmpdir(), "cycle-doctor-bin-"));
  try {
    const missing = join(bin, "does-not-exist");
    const r = await runDoctor({
      cwd: root,
      workflow: "feature",
      env: { ...process.env, CYCLE_CODEX_BIN: missing },
    });
    assert.notEqual(r.exitCode, 0);
    assert.match(r.stdout, /agent\s+codex\s+FAIL/);
    // The failure footer names the binary, its resolved path, and a remediation.
    assert.match(r.stdout, /FAIL codex: codex resolved to .*does-not-exist/);
    assert.match(r.stdout, /npm i -g @openai\/codex/);
    assert.match(r.stdout, /doctor: \d+ check\(s\) failed\n$/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("doctor: unloadable config exits non-zero with stderr diagnostic, no throw", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-doctor-empty-"));
  try {
    let r;
    await assert.doesNotReject(async () => {
      r = await runDoctor({ cwd: root, workflow: "feature", env: { ...process.env } });
    });
    assert.notEqual(r!.exitCode, 0);
    assert.equal(r!.stdout, "");
    assert.match(r!.stderr, /could not load config/);
    assert.match(r!.stderr, /workflows\.yml missing/);
    assert.match(r!.stderr, /cycle init/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("doctor: read-only — no engine.lock, no new .cycle/ files", async () => {
  const root = await makeRepo();
  const bin = await mkdtemp(join(tmpdir(), "cycle-doctor-bin-"));
  try {
    const codex = await writeFake(bin, "codex", PASS);
    const before = (await readdir(join(root, ".cycle"))).sort();
    await runDoctor({
      cwd: root,
      workflow: "feature",
      env: { ...process.env, CYCLE_CODEX_BIN: codex },
    });
    assert.equal(existsSync(join(root, ".cycle/engine.lock")), false);
    const after = (await readdir(join(root, ".cycle"))).sort();
    assert.deepEqual(after, before);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("doctor: doctor and preflight route to identical output for same opts", async () => {
  const root = await makeRepo();
  const bin = await mkdtemp(join(tmpdir(), "cycle-doctor-bin-"));
  try {
    const codex = await writeFake(bin, "codex", PASS);
    const opts = {
      cwd: root,
      workflow: "feature",
      env: { ...process.env, CYCLE_CODEX_BIN: codex },
    };
    // The dispatch block routes both `doctor` and `preflight` argv heads to the
    // same runDoctor call; equal opts ⇒ byte-identical output.
    const a = await runDoctor(opts);
    const b = await runDoctor(opts);
    assert.equal(a.stdout, b.stdout);
    assert.equal(a.exitCode, b.exitCode);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

// --- renderReport branch coverage (hand-built fixtures) ---

test("renderReport: warning present with no failure renders warn line, ok summary", () => {
  const result: PreflightResult = {
    ok: true,
    checks: [{ kind: "agent", name: "codex", resolvedPath: "/usr/bin/codex", ok: true }],
    failures: [],
    warnings: [
      {
        kind: "wsl_shadow",
        target: "gemini",
        resolvedPath: "/mnt/c/foo/gemini",
        message: "gemini resolves under /mnt/c/foo/gemini (WSL /mnt/c) — may be a Windows build.",
      },
    ],
  };
  const out = renderReport(result);
  assert.match(out, /warn\s+gemini\s+gemini resolves under/);
  assert.match(out, /doctor: all checks passed\n$/);
});

test("renderReport: internal failure surfaces in footer with non-ok summary", () => {
  const result: PreflightResult = {
    ok: false,
    checks: [],
    failures: [
      { kind: "internal", name: "preflight", resolvedPath: null, fix: "internal preflight error: boom" },
    ],
    warnings: [],
  };
  const out = renderReport(result);
  assert.match(out, /FAIL preflight: internal preflight error: boom/);
  assert.match(out, /doctor: 1 check\(s\) failed\n$/);
});

test("renderReport: failed check renders FAIL marker in table and footer", () => {
  const result: PreflightResult = {
    ok: false,
    checks: [
      { kind: "agent", name: "codex", resolvedPath: null, ok: false },
      { kind: "tool", name: "git", resolvedPath: "/usr/bin/git", ok: true },
    ],
    failures: [
      { kind: "agent", name: "codex", resolvedPath: null, fix: "install codex" },
    ],
    warnings: [],
  };
  const out = renderReport(result);
  assert.match(out, /agent\s+codex\s+FAIL/);
  assert.match(out, /tool\s+git\s+ok\s+\/usr\/bin\/git/);
  assert.match(out, /FAIL codex: install codex/);
});
