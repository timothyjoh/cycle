import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAgent } from "../../src/engine/exec.ts";

test("invokes claude -p with prompt body, captures stdout", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "Write a one-line spec.", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\necho SPECCED $@\n", "utf8");
    await chmod(fake, 0o755);

    const r = await resolveAgent("claudecode").runStep({ repoRoot: root, promptPath: "prompts/spec.md", env: { PATH: `${bin}:${process.env.PATH}` } });
    assert.equal(r.status, "ok");
    assert.match(r.stdout, /SPECCED/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("resolves StepResult{status:failed,exitCode:-1} when claude binary missing (spawn ENOENT)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    const r = await resolveAgent("claudecode").runStep({
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

test("includes --append-system-prompt in argv when appendSystemPrompt is provided", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "Write a spec.", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\necho ARGS $@\n", "utf8");
    await chmod(fake, 0o755);

    const r = await resolveAgent("claudecode").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      env: { PATH: `${bin}:${process.env.PATH}` },
      appendSystemPrompt: "suppress-learning-mode",
    });
    assert.equal(r.status, "ok");
    assert.ok(r.stdout.includes("--append-system-prompt"), "expected --append-system-prompt in argv");
    assert.ok(r.stdout.includes("suppress-learning-mode"), "expected suppression text in argv");
    const argv = r.stdout.trim().split(/\s+/);
    assert.ok(
      argv.indexOf("--append-system-prompt") < argv.indexOf("-p"),
      "--append-system-prompt must precede -p in argv"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("omits --append-system-prompt from argv when appendSystemPrompt is not provided", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "Write a spec.", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\necho ARGS $@\n", "utf8");
    await chmod(fake, 0o755);

    const r = await resolveAgent("claudecode").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(r.status, "ok");
    assert.ok(!r.stdout.includes("--append-system-prompt"), "expected --append-system-prompt absent from argv");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("sets rateLimited:true when binary exits 1 with rate-limit signal in stderr", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, '#!/bin/sh\necho "rate limit exceeded" >&2\nexit 1\n', "utf8");
    await chmod(fake, 0o755);

    const r = await resolveAgent("claudecode").runStep({
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
