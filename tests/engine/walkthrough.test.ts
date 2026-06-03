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
  walkthroughManifestName,
  WALKTHROUGH_MEDIA_DIRNAME,
  WALKTHROUGH_MANIFEST,
  WALKTHROUGH_KILL_GRACE_MS,
  DEFAULT_WALKTHROUGH_HOOK_TIMEOUT_MS,
  type WalkthroughTimer,
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

test("execWalkthroughHook resolves a failed StepResult on an unresolved shell without arming a timer", async () => {
  const root = await tmproot("wt-exec-unresolved-");
  try {
    const { timer, calls } = recordingTimer();
    const r = await execWalkthroughHook(root, join(root, "any.sh"), {}, {
      timeoutMs: 50_000,
      timer,
      shell: { ok: false, searched: ["C:\\Program Files\\Git\\bin\\bash.exe"], message: "no shell: install git-bash or set CYCLE_SHELL" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /git-bash/);
    assert.match(r.stderr, /CYCLE_SHELL/);
    // No spawn happened, so the bounded-kill timer must never be armed.
    assert.equal(calls.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---- execWalkthroughHook: bounded-kill timeout ----

/** A synchronous fake WalkthroughTimer that records each arm and lets the test
 * fire callbacks deterministically, with no dependence on real wall-clock. */
function recordingTimer(): { timer: WalkthroughTimer; calls: { ms: number; cb: () => void }[] } {
  const calls: { ms: number; cb: () => void }[] = [];
  const timer: WalkthroughTimer = (ms, cb) => {
    calls.push({ ms, cb });
    return { clear: () => {} };
  };
  return { timer, calls };
}

const sleepMs = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
/** Resolves "pending" if `p` has not settled within `ms`, else "settled". */
async function settledWithin(p: Promise<unknown>, ms: number): Promise<"settled" | "pending"> {
  return Promise.race([
    p.then(() => "settled" as const),
    sleepMs(ms).then(() => "pending" as const),
  ]);
}

test("execWalkthroughHook arms the timer but a fast hook resolves ok with no timedOut and no kill", async () => {
  const root = await tmproot("wt-exec-timer-ok-");
  try {
    const hook = join(root, "hook.sh");
    await writeFile(hook, "#!/bin/bash\nexit 0\n", "utf8");
    await chmod(hook, 0o755);
    const { timer, calls } = recordingTimer();
    const r = await execWalkthroughHook(root, hook, {}, { timeoutMs: 50_000, timer });
    assert.equal(r.status, "ok");
    assert.ok(!("timedOut" in r) || r.timedOut === undefined, "no timedOut marking on a clean exit");
    // The timeout timer was armed (length 1) but its callback was never fired,
    // so no SIGKILL grace timer was ever scheduled.
    assert.equal(calls.length, 1, "timeout timer armed once");
    assert.equal(calls[0].ms, 50_000);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("execWalkthroughHook kills a hung hook via SIGTERM→SIGKILL escalation and resolves timedOut/failed", async () => {
  const root = await tmproot("wt-exec-timeout-");
  try {
    const hook = join(root, "hook.sh");
    // Ignore SIGTERM so only the escalation SIGKILL can terminate the child —
    // this proves the two-stage escalation rather than a single SIGTERM.
    await writeFile(hook, "#!/bin/bash\ntrap '' TERM\nsleep 30\n", "utf8");
    await chmod(hook, 0o755);
    const { timer, calls } = recordingTimer();
    const p = execWalkthroughHook(root, hook, {}, { timeoutMs: 50, timer });
    await sleepMs(150); // let the child actually start so the group exists
    assert.equal(calls.length, 1, "timeout timer armed");
    assert.equal(calls[0].ms, 50);

    calls[0].cb(); // fire timeout → timedOut=true, SIGTERM (trapped/ignored), arm SIGKILL grace
    assert.equal(calls.length, 2, "SIGKILL grace timer armed after timeout fires");
    assert.equal(calls[1].ms, WALKTHROUGH_KILL_GRACE_MS);

    // SIGTERM is ignored by the trap, so the hook is still running — the promise
    // must NOT have resolved yet. This is the escalation proof.
    assert.equal(await settledWithin(p, 150), "pending", "SIGTERM alone must not terminate the trapping hook");

    calls[1].cb(); // fire grace → SIGKILL → child dies → close fires
    const r = await p;
    assert.equal(r.status, "failed");
    assert.equal(r.timedOut, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("execWalkthroughHook does not arm any timer when the timeout is disabled (0 / omitted)", async () => {
  const root = await tmproot("wt-exec-disabled-");
  try {
    const hook = join(root, "hook.sh");
    // A real (small) sleep proves the hook runs to completion with no timer.
    await writeFile(hook, "#!/bin/bash\nsleep 0.2\nexit 0\n", "utf8");
    await chmod(hook, 0o755);

    const { timer, calls } = recordingTimer();
    const r0 = await execWalkthroughHook(root, hook, {}, { timeoutMs: 0, timer });
    assert.equal(r0.status, "ok");
    assert.ok(!("timedOut" in r0) || r0.timedOut === undefined);
    assert.equal(calls.length, 0, "timeoutMs:0 arms no timer");

    // Omitted opts (the legacy 3-arg call) also arms nothing and runs to completion.
    const r1 = await execWalkthroughHook(root, hook, {});
    assert.equal(r1.status, "ok");
    assert.ok(!("timedOut" in r1) || r1.timedOut === undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("execWalkthroughHook killTree fallback swallows already-gone child without affecting the result", async () => {
  const root = await tmproot("wt-exec-killgone-");
  try {
    const hook = join(root, "hook.sh");
    await writeFile(hook, "#!/bin/bash\nexit 0\n", "utf8");
    await chmod(hook, 0o755);
    const { timer, calls } = recordingTimer();
    // Let the hook fully exit and resolve first (single-resolve guard settles).
    const r = await execWalkthroughHook(root, hook, {}, { timeoutMs: 50_000, timer });
    assert.equal(r.status, "ok");
    // Now fire the (stale) timeout + grace callbacks: the child is already
    // reaped, so process.kill(-pid) throws ESRCH and falls back to child.kill,
    // which also throws and is swallowed — exercising the kill fallback path
    // without double-resolving (status stays ok, no rejection).
    assert.equal(calls.length, 1);
    calls[0].cb(); // SIGTERM on a dead group → caught → child.kill → caught
    assert.equal(calls.length, 2, "grace timer still armed even on a dead child");
    calls[1].cb(); // SIGKILL on a dead group → caught → child.kill → caught
    // Result is unchanged by the stale kill callbacks (single-resolve guard).
    assert.equal(r.status, "ok");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("DEFAULT_WALKTHROUGH_HOOK_TIMEOUT_MS is the documented 10-minute recommendation", () => {
  assert.equal(DEFAULT_WALKTHROUGH_HOOK_TIMEOUT_MS, 600_000);
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

// ---- walkthroughManifestName (phase-aware) ----

test("walkthroughManifestName: undefined ⇒ un-phased manifest, before/after ⇒ phased names", () => {
  assert.equal(walkthroughManifestName(), WALKTHROUGH_MANIFEST);
  assert.equal(walkthroughManifestName(undefined), WALKTHROUGH_MANIFEST);
  assert.equal(walkthroughManifestName("before"), "walkthrough-before-artifacts.json");
  assert.equal(walkthroughManifestName("after"), "walkthrough-after-artifacts.json");
});

// ---- collectWalkthroughMedia (phase-scoped) ----

test("collectWalkthroughMedia(dir, phase) scans walkthrough/<phase>/ and returns artifactDir-relative paths", async () => {
  const root = await tmproot("wt-collect-phase-");
  try {
    const phaseDir = join(root, WALKTHROUGH_MEDIA_DIRNAME, "before");
    await mkdir(join(phaseDir, "sub"), { recursive: true });
    await writeFile(join(phaseDir, "shot.png"), "x", "utf8");
    await writeFile(join(phaseDir, "sub", "nested.png"), "z", "utf8");
    // An unrelated file in the un-phased dir must NOT be collected for "before".
    await writeFile(join(root, WALKTHROUGH_MEDIA_DIRNAME, "stray.png"), "q", "utf8");
    const got = await collectWalkthroughMedia(root, "before");
    assert.deepEqual(got, [
      join(WALKTHROUGH_MEDIA_DIRNAME, "before", "shot.png"),
      join(WALKTHROUGH_MEDIA_DIRNAME, "before", "sub", "nested.png"),
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("collectWalkthroughMedia(dir, phase) returns [] for a missing phase subdir", async () => {
  const root = await tmproot("wt-collect-phase-none-");
  try {
    // The un-phased dir exists but the phase subdir does not ⇒ clean [].
    await mkdir(join(root, WALKTHROUGH_MEDIA_DIRNAME), { recursive: true });
    assert.deepEqual(await collectWalkthroughMedia(root, "after"), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("collectWalkthroughMedia(dir, phase) throws on a non-ENOENT readdir error (phase path is a file)", async () => {
  const root = await tmproot("wt-collect-phase-enotdir-");
  try {
    await mkdir(join(root, WALKTHROUGH_MEDIA_DIRNAME), { recursive: true });
    await writeFile(join(root, WALKTHROUGH_MEDIA_DIRNAME, "before"), "not a dir", "utf8");
    await assert.rejects(
      collectWalkthroughMedia(root, "before"),
      (e: NodeJS.ErrnoException) => e.code !== "ENOENT",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---- writeWalkthroughManifest (phase-scoped) ----

test("writeWalkthroughManifest(dir, media, phase) writes the per-phase manifest", async () => {
  const root = await tmproot("wt-manifest-phase-");
  try {
    const media = [join(WALKTHROUGH_MEDIA_DIRNAME, "after", "a.png")];
    const p = await writeWalkthroughManifest(root, media, "after");
    assert.equal(p, join(root, "walkthrough-after-artifacts.json"));
    const parsed = JSON.parse(await readFile(p, "utf8"));
    assert.deepEqual(parsed.media, media);
    assert.equal(parsed.count, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
