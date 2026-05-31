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

test("includes --model <value> in argv when model is set, immediately followed by the value", async () => {
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
      model: "claude-opus-4-8",
    });
    assert.equal(r.status, "ok");
    const argv = r.stdout.trim().split(/\s+/);
    const i = argv.indexOf("--model");
    assert.ok(i >= 0, "expected --model in argv");
    assert.equal(argv[i + 1], "claude-opus-4-8", "--model must be immediately followed by the value");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("omits --model from argv when model is not provided", async () => {
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
    assert.ok(!r.stdout.includes("--model"), "expected --model absent from argv");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("omits --model from argv when model is an empty string (treated as unset)", async () => {
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
      model: "",
    });
    assert.equal(r.status, "ok");
    assert.ok(!r.stdout.includes("--model"), "expected no --model flag for empty-string model");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("-p remains the last builder token across all model/appendSystemPrompt permutations", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
  try {
    const prompts = join(root, ".cycle/prompts");
    await mkdir(prompts, { recursive: true });
    await writeFile(join(prompts, "spec.md"), "PROMPTBODY", "utf8");

    const fake = join(bin, "claude");
    await writeFile(fake, "#!/bin/bash\necho ARGS $@\n", "utf8");
    await chmod(fake, 0o755);

    const env = { PATH: `${bin}:${process.env.PATH}` };
    const base = { repoRoot: root, promptPath: "prompts/spec.md", env };
    const permutations: Array<{ repoRoot: string; promptPath: string; env: { PATH: string }; model?: string; appendSystemPrompt?: string }> = [
      { ...base }, // (a) no model, no appendSP
      { ...base, model: "claude-opus-4-8" }, // (b) model only
      { ...base, appendSystemPrompt: "sup" }, // (c) appendSP only
      { ...base, model: "claude-opus-4-8", appendSystemPrompt: "sup" }, // (d) both
    ];

    for (const opts of permutations) {
      const r = await resolveAgent("claudecode").runStep(opts);
      assert.equal(r.status, "ok");
      const argv = r.stdout.trim().split(/\s+/);
      const pIdx = argv.indexOf("-p");
      assert.ok(pIdx >= 0, "expected -p in argv");
      // The only token after -p is the appended prompt body; -p is the last builder token.
      assert.equal(argv[pIdx + 1], "PROMPTBODY", "-p must be the final builder token (prompt body appended after it)");
      assert.equal(argv.length, pIdx + 2, "nothing other than the prompt body follows -p");
      if (opts.model) assert.ok(argv.indexOf("--model") < pIdx, "--model must precede -p");
      if (opts.appendSystemPrompt) assert.ok(argv.indexOf("--append-system-prompt") < pIdx, "--append-system-prompt must precede -p");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("never emits --thinking even when thinking is passed", async () => {
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
      model: "claude-opus-4-8",
      thinking: "high",
    });
    assert.equal(r.status, "ok");
    assert.ok(!r.stdout.includes("--thinking"), "expected no --thinking flag");
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
