import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { StepResult } from "./exec-bash.ts";

export async function execClaudecodeStep(repoRoot: string, promptPath: string, env: Record<string, string>): Promise<StepResult> {
  const abs = join(repoRoot, ".cycle", promptPath);
  const prompt = await readFile(abs, "utf8");
  return new Promise(resolve => {
    const child = spawn("claude", ["-p", prompt], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
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
