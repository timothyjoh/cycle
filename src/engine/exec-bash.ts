import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildChildEnv } from "./child-env.ts";
import { resolveShell, type ShellResolution } from "./shell.ts";

export type { StepResult } from "./exec-types.ts";
import type { StepResult } from "./exec-types.ts";

export function execBashStep(
  repoRoot: string,
  command: string,
  env: Record<string, string>,
  shell: ShellResolution = resolveShell({
    platform: process.platform,
    env: process.env,
    existsSync,
  }),
): Promise<StepResult> {
  return new Promise(resolve => {
    // Unresolved shell (Windows, nothing discovered, no override): fail without
    // spawning. The resolver owns the actionable message (searched + remediation).
    if (!shell.ok) {
      resolve({ status: "failed", exitCode: 1, stdout: "", stderr: shell.message });
      return;
    }
    const abs = join(repoRoot, ".cycle", command);
    const child = spawn(shell.path, [abs], {
      cwd: repoRoot,
      env: buildChildEnv(env),
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });
    // A configured/resolved shell path that does not exist emits `error`
    // (ENOENT) — convert it to a failed StepResult, never an unhandled rejection.
    child.on("error", err => resolve({ status: "failed", exitCode: -1, stdout, stderr: stderr + String(err) }));
    child.on("close", code => {
      resolve({
        status: code === 0 ? "ok" : "failed",
        exitCode: code ?? -1,
        stdout,
        stderr,
      });
    });
  });
}
