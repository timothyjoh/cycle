import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { stat, readdir, writeFile } from "node:fs/promises";
import { join, isAbsolute, relative } from "node:path";
import { buildChildEnv } from "./child-env.ts";
import { resolveShell, type ShellResolution } from "./shell.ts";
import type { StepResult } from "./exec-types.ts";
import type { CycleConfig } from "./workflow.ts";

export const WALKTHROUGH_MEDIA_DIRNAME = "walkthrough";
export const WALKTHROUGH_MANIFEST = "walkthrough-artifacts.json";

/** Manifest basename for a walkthrough phase. Un-phased (the feature
 * walkthrough_capture step) keeps WALKTHROUGH_MANIFEST byte-for-byte; phased
 * quickfix steps (walkthrough_before / walkthrough_after) use
 * `walkthrough-<phase>-artifacts.json`. Pure string construction — no failure
 * surface. */
export function walkthroughManifestName(phase?: string): string {
  return phase ? `walkthrough-${phase}-artifacts.json` : WALKTHROUGH_MANIFEST;
}

/** Grace period (ms) between SIGTERM and the escalation SIGKILL — mirrors exec-spawn.ts. */
export const WALKTHROUGH_KILL_GRACE_MS = 5_000;
/** Documented recommended value for engine.walkthrough_hook_timeout_ms (10 min).
 * NOT auto-applied: an absent/malformed config disables the timeout entirely
 * (see the run-cycle.ts read site). This constant is the value users set to opt in. */
export const DEFAULT_WALKTHROUGH_HOOK_TIMEOUT_MS = 600_000;

/** Injectable timer seam: same shape as setTimeout, returning a clearable handle.
 * The default wraps a real setTimeout that .unref()s so the timer never keeps the
 * event loop alive on its own. Tests inject a synchronous fake to drive expiry
 * deterministically without depending on real wall-clock elapsed time. */
export type WalkthroughTimer = (ms: number, cb: () => void) => { clear: () => void };
const defaultTimer: WalkthroughTimer = (ms, cb) => {
  const t = setTimeout(cb, ms);
  if (t.unref) t.unref();
  return { clear: () => clearTimeout(t) };
};

/** Resolve the active walkthrough hook to an absolute path, or null if none.
 * Order: explicit engine.walkthrough_hook (relative→repoRoot), then the
 * `.cycle/walkthrough.sh` convention. A hook is "active" only when the resolved
 * path exists, is a regular file, and is executable. Any stat error ⇒ null
 * (inert), never throws. */
export async function resolveWalkthroughHook(
  repoRoot: string,
  cfg: CycleConfig,
): Promise<string | null> {
  const raw = cfg.engine.walkthrough_hook;
  const configured = typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
  const candidate = configured
    ? (isAbsolute(configured) ? configured : join(repoRoot, configured))
    : join(repoRoot, ".cycle", "walkthrough.sh");
  try {
    const st = await stat(candidate);
    if (st.isFile() && (st.mode & 0o111) !== 0) return candidate;
  } catch {
    /* absent/unreadable ⇒ inert */
  }
  return null;
}

/** Spawn the hook via the resolved shell (array args, shell:false; see
 * shell.ts resolveShell — /bin/bash on POSIX, discovered git-bash/WSL on
 * Windows). An unresolved shell, non-zero exit, or spawn error resolve to a
 * failed StepResult — never an unhandled rejection.
 *
 * When `opts.timeoutMs` is a positive number, an injectable timer arms a
 * bounded-kill: on expiry the child's whole process group is signalled
 * SIGTERM, then SIGKILL after `WALKTHROUGH_KILL_GRACE_MS`, the result is
 * marked `timedOut: true`, and `{ status: "failed", … }` resolves once `close`
 * fires — mirroring the escalation in exec-spawn.ts. `detached: true` puts the
 * child in its own process group so the kill reaches grandchildren (browsers,
 * dev-servers) that hold pipes open and would otherwise prevent `close`. A
 * single-resolve guard prevents timeout + close/error double-resolution.
 * `timeoutMs` of 0/undefined disables the timer (hook runs to completion). */
export function execWalkthroughHook(
  repoRoot: string,
  hookAbsPath: string,
  env: Record<string, string>,
  opts: { timeoutMs?: number; timer?: WalkthroughTimer; shell?: ShellResolution } = {},
): Promise<StepResult> {
  return new Promise(resolve => {
    const shell = opts.shell ?? resolveShell({
      platform: process.platform,
      env: process.env,
      existsSync,
    });
    // Unresolved shell (Windows, nothing discovered, no override): fail without
    // spawning or arming any timer. The resolver owns the actionable message.
    if (!shell.ok) {
      resolve({ status: "failed", exitCode: 1, stdout: "", stderr: shell.message });
      return;
    }
    // `detached: true` → own process group, so killTree can signal the whole
    // tree. We never .unref() the child — the parent still awaits `close`.
    const child = spawn(shell.path, [hookAbsPath], {
      cwd: repoRoot,
      env: buildChildEnv(env),
      shell: false,
      detached: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const timer = opts.timer ?? defaultTimer;
    let timeoutHandle: { clear: () => void } | undefined;
    let killHandle: { clear: () => void } | undefined;
    const done = (r: StepResult) => {
      if (settled) return;
      settled = true;
      timeoutHandle?.clear();
      killHandle?.clear();
      resolve(r);
    };
    // Kill the child's whole process group (negative pid). A grandchild that
    // inherited a pipe would otherwise keep it open and prevent `close`.
    const killTree = (sig: NodeJS.Signals) => {
      try { if (child.pid) process.kill(-child.pid, sig); }
      catch { try { child.kill(sig); } catch { /* already gone */ } }
    };
    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("error", err => done({ status: "failed", exitCode: -1, stdout, stderr: stderr + String(err) }));
    child.on("close", code => done(timedOut
      ? { status: "failed", exitCode: code ?? -1, stdout, stderr, timedOut: true }
      : { status: code === 0 ? "ok" : "failed", exitCode: code ?? -1, stdout, stderr }));
    if (opts.timeoutMs && opts.timeoutMs > 0) {
      timeoutHandle = timer(opts.timeoutMs, () => {
        timedOut = true;
        killTree("SIGTERM");
        killHandle = timer(WALKTHROUGH_KILL_GRACE_MS, () => killTree("SIGKILL"));
      });
    }
  });
}

/** List media the hook wrote under <artifactDir>/walkthrough/ (un-phased) or
 * <artifactDir>/walkthrough/<phase>/ (phased quickfix steps). Missing dir ⇒
 * [] (hook produced nothing for that phase — clean). Any other readdir error
 * throws (the collect-failure degrade surface). Paths are relative to
 * artifactDir, so a phased file is e.g. `walkthrough/before/shot.png`. */
export async function collectWalkthroughMedia(
  artifactDir: string,
  phase?: string,
): Promise<string[]> {
  const mediaDir = phase
    ? join(artifactDir, WALKTHROUGH_MEDIA_DIRNAME, phase)
    : join(artifactDir, WALKTHROUGH_MEDIA_DIRNAME);
  let entries;
  try {
    entries = await readdir(mediaDir, { recursive: true, withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return entries
    .filter(e => e.isFile())
    .map(e => relative(artifactDir, join(e.parentPath ?? mediaDir, e.name)))
    .sort();
}

/** Write the manifest into artifactDir; return its absolute path. Un-phased
 * writes WALKTHROUGH_MANIFEST; a phase writes `walkthrough-<phase>-artifacts.json`
 * (via walkthroughManifestName). Throws on write failure (caller routes to
 * step.walkthrough_capture_failed). */
export async function writeWalkthroughManifest(
  artifactDir: string,
  media: string[],
  phase?: string,
): Promise<string> {
  const manifestPath = join(artifactDir, walkthroughManifestName(phase));
  await writeFile(manifestPath, JSON.stringify({ media, count: media.length }, null, 2), "utf8");
  return manifestPath;
}
