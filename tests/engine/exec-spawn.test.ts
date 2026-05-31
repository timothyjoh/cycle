import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgent } from "../../src/engine/exec-spawn.ts";

test("runAgent argv delivery: appends prompt as final arg, captures stdout", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/spec.md"), "ARGV-PROMPT", "utf8");
    const fake = join(bin, "fake-agent");
    await writeFile(fake, "#!/bin/bash\necho ARGS $@\n", "utf8");
    await chmod(fake, 0o755);
    const r = await runAgent({
      binary: "fake-agent",
      argv: ["--flag"],
      promptDelivery: "argv",
      promptPath: "prompts/spec.md",
      repoRoot: root,
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(r.status, "ok");
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /ARGV-PROMPT/);
    assert.match(r.stdout, /--flag/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runAgent stdin delivery: pipes prompt to stdin, captures stdout", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/spec.md"), "STDIN-PROMPT", "utf8");
    const fake = join(bin, "fake-agent");
    await writeFile(fake, "#!/bin/bash\ncat\n", "utf8");
    await chmod(fake, 0o755);
    const r = await runAgent({
      binary: "fake-agent",
      argv: [],
      promptDelivery: "stdin",
      promptPath: "prompts/spec.md",
      repoRoot: root,
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(r.status, "ok");
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /STDIN-PROMPT/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runAgent ENOENT: resolves status:failed exitCode:-1 when binary missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/spec.md"), "body", "utf8");
    const r = await runAgent({
      binary: "no-such-binary",
      argv: [],
      promptDelivery: "stdin",
      promptPath: "prompts/spec.md",
      repoRoot: root,
      env: { PATH: "/nonexistent" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.exitCode, -1);
    assert.ok(r.stderr.length > 0, "stderr carries spawn error message");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runAgent non-zero exit: resolves status:failed and captures stderr", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/spec.md"), "body", "utf8");
    const fake = join(bin, "fake-agent");
    await writeFile(fake, "#!/bin/bash\necho ERROR-MSG >&2\nexit 2\n", "utf8");
    await chmod(fake, 0o755);
    const r = await runAgent({
      binary: "fake-agent",
      argv: [],
      promptDelivery: "stdin",
      promptPath: "prompts/spec.md",
      repoRoot: root,
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.exitCode, 2);
    assert.match(r.stderr, /ERROR-MSG/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runAgent timeout: kills a hung child and resolves status:failed timedOut", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/spec.md"), "body", "utf8");
    const fake = join(bin, "fake-agent");
    // Hangs for 30s; the timeout must kill it well before that.
    await writeFile(fake, "#!/bin/bash\nsleep 30\n", "utf8");
    await chmod(fake, 0o755);
    const t0 = Date.now();
    const r = await runAgent({
      binary: "fake-agent",
      argv: [],
      promptDelivery: "stdin",
      promptPath: "prompts/spec.md",
      repoRoot: root,
      env: { PATH: `${bin}:${process.env.PATH}` },
      timeoutMs: 300,
    });
    assert.equal(r.status, "failed");
    assert.equal(r.timedOut, true);
    assert.ok(Date.now() - t0 < 10_000, "resolved promptly after the timeout, not after the 30s sleep");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("runAgent timeout: a fast child completes normally and is not marked timedOut", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    await mkdir(join(root, ".cycle/prompts"), { recursive: true });
    await writeFile(join(root, ".cycle/prompts/spec.md"), "body", "utf8");
    const fake = join(bin, "fake-agent");
    await writeFile(fake, "#!/bin/bash\necho hi\n", "utf8");
    await chmod(fake, 0o755);
    const r = await runAgent({
      binary: "fake-agent",
      argv: [],
      promptDelivery: "stdin",
      promptPath: "prompts/spec.md",
      repoRoot: root,
      env: { PATH: `${bin}:${process.env.PATH}` },
      timeoutMs: 5_000,
    });
    assert.equal(r.status, "ok");
    assert.equal(r.timedOut, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});
