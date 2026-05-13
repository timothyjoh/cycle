import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAgent } from "../../src/engine/exec.ts";

test("gemini: pipes prompt body to stdin, returns stdout", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    const body = "PROMPT BODY gemini-stdin-roundtrip";
    await writeFile(join(prompts, "spec.md"), body, "utf8");

    const fake = join(bin, "gemini");
    await writeFile(fake, "#!/bin/bash\ncat\n", "utf8");
    await chmod(fake, 0o755);

    const r = await resolveAgent("gemini").runStep({
      repoRoot: root,
      promptPath: "prompts/spec.md",
      env: { PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(r.status, "ok");
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /gemini-stdin-roundtrip/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("gemini: non-zero exit surfaces status:failed and captures stderr", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    const fake = join(bin, "gemini");
    await writeFile(fake, "#!/bin/bash\necho boom >&2\nexit 1\n", "utf8");
    await chmod(fake, 0o755);

    const r = await resolveAgent("gemini").runStep({
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

test("gemini: resolves StepResult{status:failed,exitCode:-1} when gemini binary missing (spawn ENOENT)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "body", "utf8");

    const r = await resolveAgent("gemini").runStep({
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
