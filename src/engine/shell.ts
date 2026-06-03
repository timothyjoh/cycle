/** Resolvable shell abstraction for bash/script steps and the walkthrough hook.
 *
 * The two spawn sites (execBashStep, execWalkthroughHook) used to hard-code
 * "/bin/bash", which does not exist on a native Windows (PowerShell, no WSL)
 * host — every bash step crashed with `spawn /bin/bash ENOENT`. `resolveShell`
 * is the single source of resolution precedence:
 *   1. explicit `engine.shell` config — used verbatim (no existence check)
 *   2. `CYCLE_SHELL` env — used verbatim
 *   3. platform auto-discovery (POSIX: /bin/bash; Windows: probe git-bash / WSL)
 *   4. Windows-unresolved → structured failure with searched list + remediation
 *
 * Pure and side-effect-free given injected `platform` / `env` / `existsSync`;
 * performs no spawning itself. */

export type ShellResolution =
  | { ok: true; path: string }
  | { ok: false; searched: string[]; message: string };

/** Ordered Windows bash.exe probe locations (git-bash preferred for POSIX
 * fidelity, WSL launcher last). */
export const WINDOWS_SHELL_CANDIDATES = [
  "C:\\Program Files\\Git\\bin\\bash.exe",
  "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
  "C:\\Windows\\System32\\bash.exe",
] as const;

export const POSIX_DEFAULT_SHELL = "/bin/bash";

export type ResolveShellInput = {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  /** cfg.engine.shell — used verbatim when a non-empty string. */
  config?: string;
  existsSync: (p: string) => boolean;
};

/** Resolve the shell binary to spawn. Never throws; never spawns. On Windows
 * with no override and no discoverable bash.exe, returns a typed unresolved
 * result whose `message` names the searched locations and the remediation. */
export function resolveShell(input: ResolveShellInput): ShellResolution {
  // 1. explicit config — used verbatim, NO existsSync check (user owns the choice;
  //    a wrong path then surfaces from the spawn, not from resolution).
  const cfg = input.config;
  if (typeof cfg === "string" && cfg.trim() !== "") return { ok: true, path: cfg };
  // 2. CYCLE_SHELL env — used verbatim
  const envShell = input.env.CYCLE_SHELL;
  if (typeof envShell === "string" && envShell.trim() !== "") return { ok: true, path: envShell };
  // 3. platform auto-discovery
  if (input.platform !== "win32") return { ok: true, path: POSIX_DEFAULT_SHELL };
  for (const cand of WINDOWS_SHELL_CANDIDATES) {
    if (input.existsSync(cand)) return { ok: true, path: cand };
  }
  // 4. Windows unresolved — structured failure with searched list + remediation
  return {
    ok: false,
    searched: [...WINDOWS_SHELL_CANDIDATES],
    message:
      "cycle: no POSIX shell found for bash steps on Windows. Searched:\n" +
      WINDOWS_SHELL_CANDIDATES.map(p => `  - ${p}`).join("\n") +
      "\nFix: install Git for Windows (git-bash) or WSL, or set engine.shell in " +
      ".cycle/workflows.yml or the CYCLE_SHELL environment variable to a bash path.",
  };
}
