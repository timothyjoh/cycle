import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAgent } from "../../src/engine/exec.ts";

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

    const r = await resolveAgent("codex").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(r.status, "ok");
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /codex-stdin-roundtrip/);
  } finally {
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

    const r = await resolveAgent("codex").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /boom/);
  } finally {
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

    const r = await resolveAgent("codex").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      env: { PATH: `${bin}:${process.env.PATH}` },
      model: "o4-mini",
    });
    assert.equal(r.status, "ok");
    assert.match(r.stdout, /--model/);
    assert.match(r.stdout, /o4-mini/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("codex: --thinking flag in argv when thinking is set", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    const fake = join(bin, "codex");
    await writeFile(fake, "#!/bin/bash\necho \"$@\"\n", "utf8");
    await chmod(fake, 0o755);

    const r = await resolveAgent("codex").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      env: { PATH: `${bin}:${process.env.PATH}` },
      thinking: "high",
    });
    assert.equal(r.status, "ok");
    assert.match(r.stdout, /--thinking/);
    assert.match(r.stdout, /high/);
  } finally {
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

    const r = await resolveAgent("codex").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      env: { PATH: `${bin}:${process.env.PATH}` },
      model: "o4-mini",
      thinking: "medium",
    });
    assert.equal(r.status, "ok");
    const idx_model = r.stdout.indexOf("--model");
    const idx_thinking = r.stdout.indexOf("--thinking");
    assert.ok(idx_model !== -1, "--model present in stdout");
    assert.ok(idx_thinking !== -1, "--thinking present in stdout");
    assert.ok(idx_model < idx_thinking, "--model appears before --thinking");
    assert.match(r.stdout, /o4-mini/);
    assert.match(r.stdout, /medium/);
  } finally {
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

    const r = await resolveAgent("codex").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      env: { PATH: "/nonexistent" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.exitCode, -1);
    assert.ok(r.stderr.length > 0, "stderr carries spawn error message");
  } finally {
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

    const r = await resolveAgent("codex").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.rateLimited, true);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
