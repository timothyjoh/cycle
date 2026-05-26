import { runAgent } from "./exec-spawn.ts";
import { isRateLimitError } from "./rate-limit.ts";
import type { ExecModule } from "./exec.ts";

export const claudecodeExec: ExecModule = {
  async runStep({ appendSystemPrompt, ...args }) {
    const argv: string[] = ["--dangerously-skip-permissions"];
    if (appendSystemPrompt) argv.push("--append-system-prompt", appendSystemPrompt);
    argv.push("-p");
    const r = await runAgent({ binary: "claude", argv, promptDelivery: "argv", ...args });
    if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true as const };
    return r;
  },
};
