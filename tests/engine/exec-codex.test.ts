import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAgent } from "../../src/engine/exec.ts";

// codex is stubbed via CYCLE_CODEX_BIN (an absolute path to a fake binary), NOT
// via a PATH-prepended stub: buildChildEnv prepends node's bin dir ahead of the
// caller's PATH, so a real `codex` installed there would shadow a PATH stub and
// make these tests environment-dependent. Setting the absolute bin path keeps
// them hermetic. Tests run sequentially within this file; each sets the env var
// and deletes it in finally.

test("codex: pipes prompt body to stdin, returns stdout", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    const body = "PROMPT BODY codex-stdin-roundtrip";
    await writeFile(join(prompts, "spec.md"), body, "utf8");

    const fake = join(bin, "codex");
    await writeFile(fake, "#!/bin/bash\ncat\n", "utf8");
    await chmod(fake, 0o755);
    process.env.CYCLE_CODEX_BIN = fake;

    const r = await resolveAgent("codex").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
    });
    assert.equal(r.status, "ok");
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /codex-stdin-roundtrip/);
  } finally {
    delete process.env.CYCLE_CODEX_BIN;
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("codex: non-zero exit surfaces status:failed and captures stderr", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    const fake = join(bin, "codex");
    await writeFile(fake, "#!/bin/bash\necho boom >&2\nexit 1\n", "utf8");
    await chmod(fake, 0o755);
    process.env.CYCLE_CODEX_BIN = fake;

    const r = await resolveAgent("codex").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
    });
    assert.equal(r.status, "failed");
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /boom/);
  } finally {
    delete process.env.CYCLE_CODEX_BIN;
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("codex: --model flag in argv when model is set", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    const fake = join(bin, "codex");
    await writeFile(fake, "#!/bin/bash\necho \"$@\"\n", "utf8");
    await chmod(fake, 0o755);
    process.env.CYCLE_CODEX_BIN = fake;

    const r = await resolveAgent("codex").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      model: "o4-mini",
    });
    assert.equal(r.status, "ok");
    assert.match(r.stdout, /^exec\b/); // must use the `exec` subcommand, not bare `codex`
    assert.match(r.stdout, /--model/);
    assert.match(r.stdout, /o4-mini/);
  } finally {
    delete process.env.CYCLE_CODEX_BIN;
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("codex: maps thinking to reasoning effort via -c when thinking is set", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    const fake = join(bin, "codex");
    await writeFile(fake, "#!/bin/bash\necho \"$@\"\n", "utf8");
    await chmod(fake, 0o755);
    process.env.CYCLE_CODEX_BIN = fake;

    const r = await resolveAgent("codex").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      thinking: "high",
    });
    assert.equal(r.status, "ok");
    assert.doesNotMatch(r.stdout, /--thinking/); // codex exec has no --thinking flag
    assert.match(r.stdout, /model_reasoning_effort/);
    assert.match(r.stdout, /high/);
  } finally {
    delete process.env.CYCLE_CODEX_BIN;
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("codex: both --model and --thinking flags, model before thinking", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    const fake = join(bin, "codex");
    await writeFile(fake, "#!/bin/bash\necho \"$@\"\n", "utf8");
    await chmod(fake, 0o755);
    process.env.CYCLE_CODEX_BIN = fake;

    const r = await resolveAgent("codex").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      model: "o4-mini",
      thinking: "medium",
    });
    assert.equal(r.status, "ok");
    const idx_model = r.stdout.indexOf("--model");
    const idx_reasoning = r.stdout.indexOf("model_reasoning_effort");
    assert.ok(idx_model !== -1, "--model present in stdout");
    assert.ok(idx_reasoning !== -1, "model_reasoning_effort present in stdout");
    assert.ok(idx_model < idx_reasoning, "--model appears before reasoning effort");
    assert.match(r.stdout, /o4-mini/);
    assert.match(r.stdout, /medium/);
  } finally {
    delete process.env.CYCLE_CODEX_BIN;
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("codex: resolves StepResult{status:failed,exitCode:-1} when codex binary missing (spawn ENOENT)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    // Point at an absolute path that does not exist -> spawn ENOENT, regardless
    // of whether a real `codex` is installed on the system PATH.
    process.env.CYCLE_CODEX_BIN = join(root, "nonexistent-codex-binary");

    const r = await resolveAgent("codex").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
    });
    assert.equal(r.status, "failed");
    assert.equal(r.exitCode, -1);
    assert.ok(r.stderr.length > 0, "stderr carries spawn error message");
  } finally {
    delete process.env.CYCLE_CODEX_BIN;
    await rm(root, { recursive: true, force: true });
  }
});

test("codex: sets rateLimited:true when binary exits 1 with rate-limit signal in stderr", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    const fake = join(bin, "codex");
    await writeFile(fake, '#!/bin/sh\necho "rate limit exceeded" >&2\nexit 1\n', "utf8");
    await chmod(fake, 0o755);
    process.env.CYCLE_CODEX_BIN = fake;

    const r = await resolveAgent("codex").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
    });
    assert.equal(r.status, "failed");
    assert.equal(r.rateLimited, true);
  } finally {
    delete process.env.CYCLE_CODEX_BIN;
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
