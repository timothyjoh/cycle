import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveWalkthroughHook,
  execWalkthroughHook,
  collectWalkthroughMedia,
  writeWalkthroughManifest,
  WALKTHROUGH_MEDIA_DIRNAME,
  WALKTHROUGH_MANIFEST,
} from "../../src/engine/walkthrough.ts";
import type { CycleConfig } from "../../src/engine/workflow.ts";

function cfgWith(walkthrough_hook?: string): CycleConfig {
  return {
    engine: {
      max_consecutive_failures: 2,
      base_branch: "main",
      commit: { mode: "trunk", push: false },
      ...(walkthrough_hook !== undefined ? { walkthrough_hook } : {}),
    },
    triage: { agent: "claudecode", prompt: "prompts/triage.md", max_turns: 10 },
    workflows: [],
  } as unknown as CycleConfig;
}

async function tmproot(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

// ---- resolveWalkthroughHook ----

test("resolveWalkthroughHook returns null when no hook exists", async () => {
  const root = await tmproot("wt-resolve-none-");
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    assert.equal(await resolveWalkthroughHook(root, cfgWith()), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resolveWalkthroughHook returns the convention path when .cycle/walkthrough.sh is executable", async () => {
  const root = await tmproot("wt-resolve-conv-");
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    const hook = join(root, ".cycle", "walkthrough.sh");
    await writeFile(hook, "#!/bin/bash\nexit 0\n", "utf8");
    await chmod(hook, 0o755);
    assert.equal(await resolveWalkthroughHook(root, cfgWith()), hook);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resolveWalkthroughHook returns null for a present-but-non-executable convention file", async () => {
  const root = await tmproot("wt-resolve-noexec-");
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    const hook = join(root, ".cycle", "walkthrough.sh");
    await writeFile(hook, "#!/bin/bash\nexit 0\n", "utf8");
    await chmod(hook, 0o644);
    assert.equal(await resolveWalkthroughHook(root, cfgWith()), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resolveWalkthroughHook resolves a configured relative path against repoRoot", async () => {
  const root = await tmproot("wt-resolve-rel-");
  try {
    await mkdir(join(root, "bin"), { recursive: true });
    const hook = join(root, "bin", "shoot.sh");
    await writeFile(hook, "#!/bin/bash\nexit 0\n", "utf8");
    await chmod(hook, 0o755);
    assert.equal(await resolveWalkthroughHook(root, cfgWith("bin/shoot.sh")), hook);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resolveWalkthroughHook resolves a configured absolute path", async () => {
  const root = await tmproot("wt-resolve-abs-");
  try {
    const hook = join(root, "shoot.sh");
    await writeFile(hook, "#!/bin/bash\nexit 0\n", "utf8");
    await chmod(hook, 0o755);
    assert.equal(await resolveWalkthroughHook(root, cfgWith(hook)), hook);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resolveWalkthroughHook returns null when a configured hook is missing", async () => {
  const root = await tmproot("wt-resolve-cfgmiss-");
  try {
    assert.equal(await resolveWalkthroughHook(root, cfgWith("bin/does-not-exist.sh")), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resolveWalkthroughHook treats a blank/whitespace configured hook as the convention fallback", async () => {
  const root = await tmproot("wt-resolve-blank-");
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    const hook = join(root, ".cycle", "walkthrough.sh");
    await writeFile(hook, "#!/bin/bash\nexit 0\n", "utf8");
    await chmod(hook, 0o755);
    // Blank string falls back to the convention path, which exists & is exec.
    assert.equal(await resolveWalkthroughHook(root, cfgWith("   ")), hook);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---- execWalkthroughHook ----

test("execWalkthroughHook returns status ok for an exit-0 script and forwards CYCLE_ARTIFACT_DIR", async () => {
  const root = await tmproot("wt-exec-ok-");
  try {
    const hook = join(root, "hook.sh");
    await writeFile(hook, "#!/bin/bash\necho \"dir=$CYCLE_ARTIFACT_DIR\"\nexit 0\n", "utf8");
    await chmod(hook, 0o755);
    const r = await execWalkthroughHook(root, hook, { CYCLE_ARTIFACT_DIR: "/tmp/some/dir" });
    assert.equal(r.status, "ok");
    assert.equal(r.exitCode, 0);
    assert.ok(r.stdout.includes("dir=/tmp/some/dir"), "CYCLE_ARTIFACT_DIR must reach the child");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("execWalkthroughHook returns status failed with captured stderr for an exit-1 script", async () => {
  const root = await tmproot("wt-exec-fail-");
  try {
    const hook = join(root, "hook.sh");
    await writeFile(hook, "#!/bin/bash\necho \"boom\" >&2\nexit 1\n", "utf8");
    await chmod(hook, 0o755);
    const r = await execWalkthroughHook(root, hook, {});
    assert.equal(r.status, "failed");
    assert.equal(r.exitCode, 1);
    assert.ok(r.stderr.includes("boom"), "stderr captured");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("execWalkthroughHook resolves a failed StepResult on spawn error (missing hook file)", async () => {
  const root = await tmproot("wt-exec-spawnerr-");
  try {
    // /bin/bash runs but the script path does not exist → bash exits non-zero
    // (it does not throw an unhandled rejection).
    const r = await execWalkthroughHook(root, join(root, "nope.sh"), {});
    assert.equal(r.status, "failed");
    assert.notEqual(r.exitCode, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---- collectWalkthroughMedia ----

test("collectWalkthroughMedia returns [] for a missing media dir", async () => {
  const root = await tmproot("wt-collect-none-");
  try {
    assert.deepEqual(await collectWalkthroughMedia(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("collectWalkthroughMedia returns sorted relative paths including nested files", async () => {
  const root = await tmproot("wt-collect-some-");
  try {
    const media = join(root, WALKTHROUGH_MEDIA_DIRNAME);
    await mkdir(join(media, "sub"), { recursive: true });
    await writeFile(join(media, "shot.png"), "x", "utf8");
    await writeFile(join(media, "clip.mp4"), "y", "utf8");
    await writeFile(join(media, "sub", "nested.png"), "z", "utf8");
    const got = await collectWalkthroughMedia(root);
    assert.deepEqual(got, [
      join(WALKTHROUGH_MEDIA_DIRNAME, "clip.mp4"),
      join(WALKTHROUGH_MEDIA_DIRNAME, "shot.png"),
      join(WALKTHROUGH_MEDIA_DIRNAME, "sub", "nested.png"),
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("collectWalkthroughMedia throws on a non-ENOENT readdir error (media path is a file)", async () => {
  const root = await tmproot("wt-collect-enotdir-");
  try {
    // Make <root>/walkthrough a regular file so readdir raises ENOTDIR.
    await writeFile(join(root, WALKTHROUGH_MEDIA_DIRNAME), "not a dir", "utf8");
    await assert.rejects(
      collectWalkthroughMedia(root),
      (e: NodeJS.ErrnoException) => e.code !== "ENOENT",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---- writeWalkthroughManifest ----

test("writeWalkthroughManifest writes valid JSON with media and count", async () => {
  const root = await tmproot("wt-manifest-ok-");
  try {
    const media = [join(WALKTHROUGH_MEDIA_DIRNAME, "a.png"), join(WALKTHROUGH_MEDIA_DIRNAME, "b.mp4")];
    const p = await writeWalkthroughManifest(root, media);
    assert.equal(p, join(root, WALKTHROUGH_MANIFEST));
    const parsed = JSON.parse(await readFile(p, "utf8"));
    assert.deepEqual(parsed.media, media);
    assert.equal(parsed.count, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writeWalkthroughManifest throws when the manifest path is a directory (EISDIR)", async () => {
  const root = await tmproot("wt-manifest-eisdir-");
  try {
    await mkdir(join(root, WALKTHROUGH_MANIFEST));
    await assert.rejects(
      writeWalkthroughManifest(root, [join(WALKTHROUGH_MEDIA_DIRNAME, "a.png")]),
      (e: NodeJS.ErrnoException) => e.code === "EISDIR",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
