import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildChildEnv } from "./child-env.ts";
import type { ExecModule } from "./exec.ts";
import type { StepResult } from "./exec-bash.ts";

export const codexExec: ExecModule = {
  async runStep({ repoRoot, promptPath, env }) {
    const abs = join(repoRoot, ".cycle", promptPath);
    const prompt = await readFile(abs, "utf8");
    return new Promise<StepResult>((resolve) => {
      const child = spawn("codex", [], {
        cwd: repoRoot,
        env: buildChildEnv(env ?? {}),
        shell: false,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => { stdout += d.toString(); });
      child.stderr.on("data", (d) => { stderr += d.toString(); });
      child.on("close", (code) => {
        resolve({
          status: code === 0 ? "ok" : "failed",
          exitCode: code ?? -1,
          stdout,
          stderr,
        });
      });
      child.on("error", (err) => {
        resolve({
          status: "failed",
          exitCode: -1,
          stdout: "",
          stderr: (err as Error).message,
        });
      });
      child.stdin.on("error", () => {});
      child.stdin.write(prompt);
      child.stdin.end();
    });
  },
};
