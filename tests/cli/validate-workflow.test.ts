import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, writeFile, rm, chmod, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateWorkflowName } from "../../src/cli/validate-workflow.ts";
import { runDoctor } from "../../src/cli/doctor.ts";

const AVAILABLE = ["feature", "e2e-tests", "quickfix"];

test("undefined (flag absent) ⇒ ok when feature is configured", () => {
  const v = validateWorkflowName(undefined, AVAILABLE, "run");
  assert.deepEqual(v, { ok: true, name: "feature" });
});

test("undefined (flag absent) ⇒ rejected when feature not configured (run)", () => {
  const v = validateWorkflowName(undefined, ["e2e-tests", "quickfix"], "run");
  assert.deepEqual(v, {
    ok: false,
    message:
      'run: unknown workflow "feature" — available workflows: e2e-tests, quickfix',
  });
});

test("undefined (flag absent) ⇒ rejected when feature not configured (doctor)", () => {
  const v = validateWorkflowName(undefined, ["e2e-tests", "quickfix"], "doctor");
  assert.deepEqual(v, {
    ok: false,
    message:
      'doctor: unknown workflow "feature" — available workflows: e2e-tests, quickfix',
  });
});

test("undefined + empty available ⇒ rejected, does not throw", () => {
  const v = validateWorkflowName(undefined, [], "run");
  assert.equal(v.ok, false);
  if (!v.ok) {
    assert.match(v.message, /unknown workflow "feature"/);
    assert.match(v.message, /available workflows: $/);
  }
});

test("undefined-rejection body matches explicit-feature-unknown rejection", () => {
  const a = validateWorkflowName(undefined, ["e2e-tests"], "run");
  const b = validateWorkflowName("feature", ["e2e-tests"], "run");
  assert.equal(a.ok, false);
  assert.equal(b.ok, false);
  if (!a.ok && !b.ok) assert.equal(a.message, b.message);
});

test("valid explicit name ⇒ ok with that name", () => {
  const v = validateWorkflowName("e2e-tests", AVAILABLE, "run");
  assert.deepEqual(v, { ok: true, name: "e2e-tests" });
});

test("empty string (value-less flag) ⇒ rejected with requires-a-value message", () => {
  const v = validateWorkflowName("", AVAILABLE, "run");
  assert.equal(v.ok, false);
  if (!v.ok) {
    assert.match(v.message, /^run: --workflow requires a value/);
    assert.match(v.message, /available workflows: feature, e2e-tests, quickfix/);
  }
});

test("unknown name ⇒ rejected naming the bad value + available list", () => {
  const v = validateWorkflowName("nonsense", AVAILABLE, "run");
  assert.equal(v.ok, false);
  if (!v.ok) {
    assert.match(v.message, /^run: unknown workflow "nonsense"/);
    assert.match(v.message, /available workflows: feature, e2e-tests, quickfix/);
  }
});

test("prefix appears verbatim — doctor vs run share one message body", () => {
  const d = validateWorkflowName("nope", AVAILABLE, "doctor");
  const r = validateWorkflowName("nope", AVAILABLE, "run");
  assert.equal(d.ok, false);
  assert.equal(r.ok, false);
  if (!d.ok && !r.ok) {
    assert.ok(d.message.startsWith("doctor: "));
    assert.ok(r.message.startsWith("run: "));
    // Identical body after the prefix label.
    assert.equal(d.message.slice("doctor".length), r.message.slice("run".length));
  }
});

test("empty available list renders a clean (empty) list and still rejects unknown", () => {
  const v = validateWorkflowName("x", [], "run");
  assert.equal(v.ok, false);
  if (!v.ok) assert.match(v.message, /available workflows: $/);
});

test("never throws for arbitrary string / empty / undefined input", () => {
  assert.doesNotThrow(() => validateWorkflowName(undefined, AVAILABLE, "run"));
  assert.doesNotThrow(() => validateWorkflowName("", AVAILABLE, "run"));
  assert.doesNotThrow(() => validateWorkflowName("--dry-run", AVAILABLE, "run"));
  assert.doesNotThrow(() => validateWorkflowName("\n\t weird ", [], "run"));
});

// --- Anti-drift: runDoctor and the run path consume the SAME helper (AC#5) ---

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
  const root = await mkdtemp(join(tmpdir(), "cycle-validate-wf-"));
  await mkdir(join(root, ".cycle"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), WORKFLOWS_YML, "utf8");
  return root;
}

test("behavioral equivalence: runDoctor's unknown-name stderr == helper message", async () => {
  const root = await makeRepo();
  const bin = await mkdtemp(join(tmpdir(), "cycle-validate-wf-bin-"));
  try {
    const codex = join(bin, "codex");
    await writeFile(codex, "#!/bin/bash\nexit 0\n", "utf8");
    await chmod(codex, 0o755);
    const r = await runDoctor({
      cwd: root,
      workflow: "no_such_wf",
      env: { ...process.env, CYCLE_CODEX_BIN: codex },
    });
    const expected = validateWorkflowName("no_such_wf", ["feature"], "doctor");
    assert.equal(expected.ok, false);
    if (!expected.ok) assert.equal(r.stderr, expected.message);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("structural reference: doctor.ts and cli.ts both import + call validateWorkflowName", async () => {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const srcDir = join(here, "..", "..", "src");
  const doctorSrc = await readFile(join(srcDir, "cli", "doctor.ts"), "utf8");
  const cliSrc = await readFile(join(srcDir, "cli.ts"), "utf8");

  assert.match(doctorSrc, /from "\.\/validate-workflow\.ts"/);
  assert.match(doctorSrc, /validateWorkflowName\(/);
  assert.match(cliSrc, /from "\.\/cli\/validate-workflow\.ts"/);
  assert.match(cliSrc, /validateWorkflowName\(/);
});
