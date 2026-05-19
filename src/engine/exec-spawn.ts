import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildChildEnv } from "./child-env.ts";
import type { StepResult } from "./exec-bash.ts";

export interface RunAgentOptions {
  binary: string;
  argv: string[];
  promptDelivery: "stdin" | "argv";
  promptPath: string;
  repoRoot: string;
  env?: Record<string, string>;
  signal?: AbortSignal;
}

export async function runAgent(opts: RunAgentOptions): Promise<StepResult> {
  const { binary, argv, promptDelivery, promptPath, repoRoot, env, signal } = opts;
  const abs = join(repoRoot, ".cycle", promptPath);
  const prompt = await readFile(abs, "utf8");
  const finalArgv = promptDelivery === "argv" ? [...argv, prompt] : argv;
  const base = { cwd: repoRoot, env: buildChildEnv(env ?? {}), shell: false, signal };

  return new Promise<StepResult>((resolve) => {
    const child =
      promptDelivery === "argv"
        ? spawn(binary, finalArgv, { ...base, stdio: ["ignore", "pipe", "pipe"] })
        : spawn(binary, finalArgv, base);

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("close", (code) => {
      resolve({ status: code === 0 ? "ok" : "failed", exitCode: code ?? -1, stdout, stderr });
    });
    child.on("error", (err) => {
      resolve({ status: "failed", exitCode: -1, stdout: "", stderr: (err as Error).message });
    });
    if (promptDelivery === "stdin") {
      child.stdin!.on("error", () => {});
      child.stdin!.write(prompt);
      child.stdin!.end();
    }
  });
}
