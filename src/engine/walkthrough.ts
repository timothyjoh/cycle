import { spawn } from "node:child_process";
import { stat, readdir, writeFile } from "node:fs/promises";
import { join, isAbsolute, relative } from "node:path";
import { buildChildEnv } from "./child-env.ts";
import type { StepResult } from "./exec-types.ts";
import type { CycleConfig } from "./workflow.ts";

export const WALKTHROUGH_MEDIA_DIRNAME = "walkthrough";
export const WALKTHROUGH_MANIFEST = "walkthrough-artifacts.json";

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

/** Spawn the hook via /bin/bash (array args, shell:false). Non-zero exit /
 * spawn error resolve to a failed StepResult — never an unhandled rejection. */
export function execWalkthroughHook(
  repoRoot: string,
  hookAbsPath: string,
  env: Record<string, string>,
): Promise<StepResult> {
  return new Promise(resolve => {
    const child = spawn("/bin/bash", [hookAbsPath], {
      cwd: repoRoot,
      env: buildChildEnv(env),
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("error", err => resolve({ status: "failed", exitCode: -1, stdout, stderr: stderr + String(err) }));
    child.on("close", code => resolve({
      status: code === 0 ? "ok" : "failed",
      exitCode: code ?? -1,
      stdout,
      stderr,
    }));
  });
}

/** List media the hook wrote under <artifactDir>/walkthrough/. Missing dir ⇒
 * [] (hook produced nothing — clean). Any other readdir error throws (the
 * collect-failure degrade surface). Paths are relative to artifactDir. */
export async function collectWalkthroughMedia(artifactDir: string): Promise<string[]> {
  const mediaDir = join(artifactDir, WALKTHROUGH_MEDIA_DIRNAME);
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

/** Write the manifest into artifactDir; return its absolute path. Throws on
 * write failure (caller routes to step.walkthrough_capture_failed). */
export async function writeWalkthroughManifest(
  artifactDir: string,
  media: string[],
): Promise<string> {
  const manifestPath = join(artifactDir, WALKTHROUGH_MANIFEST);
  await writeFile(manifestPath, JSON.stringify({ media, count: media.length }, null, 2), "utf8");
  return manifestPath;
}
