import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAgent } from "../../src/engine/exec.ts";

test("auggie: passes --print flag and prompt as argv, returns stdout", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    const body = "PROMPT BODY auggie-argv-roundtrip";
    await writeFile(join(prompts, "spec.md"), body, "utf8");

    const fake = join(bin, "auggie");
    await writeFile(fake, '#!/bin/bash\necho "$@"\n', "utf8");
    await chmod(fake, 0o755);

    const r = await resolveAgent("auggie").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(r.status, "ok");
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /--print/);
    assert.match(r.stdout, /auggie-argv-roundtrip/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("auggie: non-zero exit surfaces status:failed and captures stderr", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    const fake = join(bin, "auggie");
    await writeFile(fake, "#!/bin/bash\necho boom >&2\nexit 1\n", "utf8");
    await chmod(fake, 0o755);

    const r = await resolveAgent("auggie").runStep({
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

test("auggie: --model flag in argv when model is set", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    const fake = join(bin, "auggie");
    await writeFile(fake, "#!/bin/bash\necho \"$@\"\n", "utf8");
    await chmod(fake, 0o755);

    const r = await resolveAgent("auggie").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      env: { PATH: `${bin}:${process.env.PATH}` },
      model: "claude-sonnet-4-5",
    });
    assert.equal(r.status, "ok");
    assert.match(r.stdout, /--print/);
    assert.match(r.stdout, /--model/);
    assert.match(r.stdout, /claude-sonnet-4-5/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("auggie: --thinking flag in argv when thinking is set", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    const fake = join(bin, "auggie");
    await writeFile(fake, "#!/bin/bash\necho \"$@\"\n", "utf8");
    await chmod(fake, 0o755);

    const r = await resolveAgent("auggie").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      env: { PATH: `${bin}:${process.env.PATH}` },
      thinking: "high",
    });
    assert.equal(r.status, "ok");
    assert.match(r.stdout, /--print/);
    assert.match(r.stdout, /--thinking/);
    assert.match(r.stdout, /high/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("auggie: both --model and --thinking flags, model before thinking", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    const fake = join(bin, "auggie");
    await writeFile(fake, "#!/bin/bash\necho \"$@\"\n", "utf8");
    await chmod(fake, 0o755);

    const r = await resolveAgent("auggie").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      env: { PATH: `${bin}:${process.env.PATH}` },
      model: "claude-sonnet-4-5",
      thinking: "medium",
    });
    assert.equal(r.status, "ok");
    const idx_print = r.stdout.indexOf("--print");
    const idx_model = r.stdout.indexOf("--model");
    const idx_thinking = r.stdout.indexOf("--thinking");
    assert.ok(idx_print !== -1, "--print present in stdout");
    assert.ok(idx_model !== -1, "--model present in stdout");
    assert.ok(idx_thinking !== -1, "--thinking present in stdout");
    assert.ok(idx_print < idx_model, "--print appears before --model");
    assert.ok(idx_model < idx_thinking, "--model appears before --thinking");
    assert.match(r.stdout, /claude-sonnet-4-5/);
    assert.match(r.stdout, /medium/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("auggie: resolves StepResult{status:failed,exitCode:-1} when auggie binary missing (spawn ENOENT)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    const r = await resolveAgent("auggie").runStep({
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
