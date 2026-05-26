import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAgent } from "../../src/engine/exec.ts";

// Tests run sequentially: all share process.env.CYCLE_PI_BIN and concurrent
// execution would cause races between set/delete across test boundaries.
describe("pi exec", { concurrency: false }, () => {
  test("pi: pipes prompt body to stdin, returns stdout", async () => {
    const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
    const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
    try {
      const prompts = join(root, ".cycle/prompts");
      await mkdir(prompts, { recursive: true });
      const body = "PROMPT BODY pi-stdin-roundtrip";
      await writeFile(join(prompts, "spec.md"), body, "utf8");

      const fake = join(bin, "pi");
      await writeFile(fake, "#!/bin/bash\ncat\n", "utf8");
      await chmod(fake, 0o755);

      process.env.CYCLE_PI_BIN = fake;
      const r = await resolveAgent("pi").runStep({
        repoRoot: root,
        promptPath: "prompts/spec.md",
      });
      assert.equal(r.status, "ok");
      assert.equal(r.exitCode, 0);
      assert.match(r.stdout, /pi-stdin-roundtrip/);
    } finally {
      delete process.env.CYCLE_PI_BIN;
      await rm(root, { recursive: true, force: true });
      await rm(bin, { recursive: true, force: true });
    }
  });

  test("pi: non-zero exit surfaces status:failed and captures stderr", async () => {
    const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
    const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
    try {
      const prompts = join(root, ".cycle/prompts");
      await mkdir(prompts, { recursive: true });
      await writeFile(join(prompts, "spec.md"), "body", "utf8");

      const fake = join(bin, "pi");
      await writeFile(fake, "#!/bin/bash\necho boom >&2\nexit 1\n", "utf8");
      await chmod(fake, 0o755);

      process.env.CYCLE_PI_BIN = fake;
      const r = await resolveAgent("pi").runStep({
        repoRoot: root,
        promptPath: "prompts/spec.md",
      });
      assert.equal(r.status, "failed");
      assert.equal(r.exitCode, 1);
      assert.match(r.stderr, /boom/);
    } finally {
      delete process.env.CYCLE_PI_BIN;
      await rm(root, { recursive: true, force: true });
      await rm(bin, { recursive: true, force: true });
    }
  });

  test("pi: --model flag in argv when model is set", async () => {
    const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
    const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
    try {
      const prompts = join(root, ".cycle/prompts");
      await mkdir(prompts, { recursive: true });
      await writeFile(join(prompts, "spec.md"), "body", "utf8");

      const fake = join(bin, "pi");
      await writeFile(fake, "#!/bin/bash\necho \"$@\"\n", "utf8");
      await chmod(fake, 0o755);

      process.env.CYCLE_PI_BIN = fake;
      const r = await resolveAgent("pi").runStep({
        repoRoot: root,
        promptPath: "prompts/spec.md",
        model: "claude-sonnet-4-5",
      });
      assert.equal(r.status, "ok");
      assert.match(r.stdout, /--model/);
      assert.match(r.stdout, /claude-sonnet-4-5/);
    } finally {
      delete process.env.CYCLE_PI_BIN;
      await rm(root, { recursive: true, force: true });
      await rm(bin, { recursive: true, force: true });
    }
  });

  test("pi: --thinking flag in argv when thinking is set", async () => {
    const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
    const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
    try {
      const prompts = join(root, ".cycle/prompts");
      await mkdir(prompts, { recursive: true });
      await writeFile(join(prompts, "spec.md"), "body", "utf8");

      const fake = join(bin, "pi");
      await writeFile(fake, "#!/bin/bash\necho \"$@\"\n", "utf8");
      await chmod(fake, 0o755);

      process.env.CYCLE_PI_BIN = fake;
      const r = await resolveAgent("pi").runStep({
        repoRoot: root,
        promptPath: "prompts/spec.md",
        thinking: "high",
      });
      assert.equal(r.status, "ok");
      assert.match(r.stdout, /--thinking/);
      assert.match(r.stdout, /high/);
    } finally {
      delete process.env.CYCLE_PI_BIN;
      await rm(root, { recursive: true, force: true });
      await rm(bin, { recursive: true, force: true });
    }
  });

  test("pi: both --model and --thinking flags, model before thinking", async () => {
    const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
    const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
    try {
      const prompts = join(root, ".cycle/prompts");
      await mkdir(prompts, { recursive: true });
      await writeFile(join(prompts, "spec.md"), "body", "utf8");

      const fake = join(bin, "pi");
      await writeFile(fake, "#!/bin/bash\necho \"$@\"\n", "utf8");
      await chmod(fake, 0o755);

      process.env.CYCLE_PI_BIN = fake;
      const r = await resolveAgent("pi").runStep({
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
      delete process.env.CYCLE_PI_BIN;
      await rm(root, { recursive: true, force: true });
      await rm(bin, { recursive: true, force: true });
    }
  });

  test("pi: resolves StepResult{status:failed,exitCode:-1} when pi binary missing (spawn ENOENT)", async () => {
    const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
    try {
      const prompts = join(root, ".cycle/prompts");
      await mkdir(prompts, { recursive: true });
      await writeFile(join(prompts, "spec.md"), "body", "utf8");

      process.env.CYCLE_PI_BIN = "/nonexistent/pi-binary-that-does-not-exist";
      const r = await resolveAgent("pi").runStep({
        repoRoot: root,
        promptPath: "prompts/spec.md",
      });
      assert.equal(r.status, "failed");
      assert.equal(r.exitCode, -1);
      assert.ok(r.stderr.length > 0, "stderr carries spawn error message");
    } finally {
      delete process.env.CYCLE_PI_BIN;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("pi: sets rateLimited:true when binary exits 1 with rate-limit signal in stderr", async () => {
    const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
    const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
    try {
      const prompts = join(root, ".cycle/prompts");
      await mkdir(prompts, { recursive: true });
      await writeFile(join(prompts, "spec.md"), "body", "utf8");

      const fake = join(bin, "pi");
      await writeFile(fake, '#!/bin/sh\necho "rate limit exceeded" >&2\nexit 1\n', "utf8");
      await chmod(fake, 0o755);

      process.env.CYCLE_PI_BIN = fake;
      const r = await resolveAgent("pi").runStep({
        repoRoot: root,
        promptPath: "prompts/spec.md",
      });
      assert.equal(r.status, "failed");
      assert.equal(r.rateLimited, true);
    } finally {
      delete process.env.CYCLE_PI_BIN;
      await rm(root, { recursive: true, force: true });
      await rm(bin, { recursive: true, force: true });
    }
  });
});
