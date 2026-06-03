import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAgent } from "../../src/engine/exec.ts";

test("opencode: invokes `opencode run` with prompt as trailing positional argv", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    const body = "PROMPT-BODY-opencode-argv-roundtrip";
    await writeFile(join(prompts, "spec.md"), body, "utf8");

    // `echo "$@"` reflects the spawned argv: the prompt is now delivered as the
    // trailing positional (promptDelivery: "argv"), not piped over stdin.
    const fake = join(bin, "opencode");
    await writeFile(fake, "#!/bin/bash\necho \"$@\"\n", "utf8");
    await chmod(fake, 0o755);
    process.env.CYCLE_OPENCODE_BIN = fake;

    const r = await resolveAgent("opencode").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
    });
    assert.equal(r.status, "ok");
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /^run\b/, "must use the `run` subcommand, not bare `opencode`");
    assert.match(r.stdout, /PROMPT-BODY-opencode-argv-roundtrip\s*$/, "prompt delivered as trailing positional argv");
  } finally {
    delete process.env.CYCLE_OPENCODE_BIN;
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("opencode: non-zero exit surfaces status:failed and captures stderr", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    const fake = join(bin, "opencode");
    await writeFile(fake, "#!/bin/bash\necho boom >&2\nexit 1\n", "utf8");
    await chmod(fake, 0o755);
    process.env.CYCLE_OPENCODE_BIN = fake;

    const r = await resolveAgent("opencode").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
    });
    assert.equal(r.status, "failed");
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /boom/);
  } finally {
    delete process.env.CYCLE_OPENCODE_BIN;
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("opencode: --model flag in argv when model is set", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    const fake = join(bin, "opencode");
    await writeFile(fake, "#!/bin/bash\necho \"$@\"\n", "utf8");
    await chmod(fake, 0o755);
    process.env.CYCLE_OPENCODE_BIN = fake;

    const r = await resolveAgent("opencode").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      model: "claude-sonnet-4-5",
    });
    assert.equal(r.status, "ok");
    assert.match(r.stdout, /--model/);
    assert.match(r.stdout, /claude-sonnet-4-5/);
  } finally {
    delete process.env.CYCLE_OPENCODE_BIN;
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("opencode: --thinking flag in argv when thinking is set", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    const fake = join(bin, "opencode");
    await writeFile(fake, "#!/bin/bash\necho \"$@\"\n", "utf8");
    await chmod(fake, 0o755);
    process.env.CYCLE_OPENCODE_BIN = fake;

    const r = await resolveAgent("opencode").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      thinking: "high",
    });
    assert.equal(r.status, "ok");
    assert.match(r.stdout, /--thinking/);
    assert.match(r.stdout, /high/);
  } finally {
    delete process.env.CYCLE_OPENCODE_BIN;
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("opencode: both --model and --thinking flags, model before thinking", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    const fake = join(bin, "opencode");
    await writeFile(fake, "#!/bin/bash\necho \"$@\"\n", "utf8");
    await chmod(fake, 0o755);
    process.env.CYCLE_OPENCODE_BIN = fake;

    const r = await resolveAgent("opencode").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      model: "claude-sonnet-4-5",
      thinking: "medium",
    });
    assert.equal(r.status, "ok");
    const idx_model = r.stdout.indexOf("--model");
    const idx_thinking = r.stdout.indexOf("--thinking");
    assert.ok(idx_model !== -1, "--model present in stdout");
    assert.ok(idx_thinking !== -1, "--thinking present in stdout");
    assert.ok(idx_model < idx_thinking, "--model appears before --thinking");
    assert.match(r.stdout, /claude-sonnet-4-5/);
    assert.match(r.stdout, /medium/);
  } finally {
    delete process.env.CYCLE_OPENCODE_BIN;
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("opencode: resolves StepResult{status:failed,exitCode:-1} when opencode binary missing (spawn ENOENT)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    process.env.CYCLE_OPENCODE_BIN = join(root, "nonexistent-opencode-binary");
    const r = await resolveAgent("opencode").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
    });
    assert.equal(r.status, "failed");
    assert.equal(r.exitCode, -1);
    assert.ok(r.stderr.length > 0, "stderr carries spawn error message");
  } finally {
    delete process.env.CYCLE_OPENCODE_BIN;
    await rm(root, { recursive: true, force: true });
  }
});

test("opencode: sets rateLimited:true when binary exits 1 with rate-limit signal in stderr", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    const fake = join(bin, "opencode");
    await writeFile(fake, '#!/bin/sh\necho "rate limit exceeded" >&2\nexit 1\n', "utf8");
    await chmod(fake, 0o755);
    process.env.CYCLE_OPENCODE_BIN = fake;

    const r = await resolveAgent("opencode").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
    });
    assert.equal(r.status, "failed");
    assert.equal(r.rateLimited, true);
  } finally {
    delete process.env.CYCLE_OPENCODE_BIN;
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
