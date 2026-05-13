import { spawn } from "node:child_process";
import { join } from "node:path";
import { buildChildEnv } from "./child-env.ts";

export type StepResult = {
  status: "ok" | "failed";
  exitCode: number;
  stdout: string;
  stderr: string;
};

export function execBashStep(repoRoot: string, command: string, env: Record<string, string>): Promise<StepResult> {
  return new Promise(resolve => {
    const abs = join(repoRoot, ".cycle", command);
    const child = spawn("/bin/bash", [abs], {
      cwd: repoRoot,
      env: buildChildEnv(env),
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });
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
