import { runAgent } from "./exec-spawn.ts";
import { isRateLimitError } from "./rate-limit.ts";
import type { ExecModule } from "./exec.ts";

// TODO: opencode flag names (--model, --thinking) are assumed from codex/auggie parity;
// verify against `opencode --help` once opencode CLI stabilizes.
export const opencodeExec: ExecModule = {
  async runStep({ model, thinking, ...args }) {
    const argv: string[] = [];
    if (model) argv.push("--model", model);
    if (thinking) argv.push("--thinking", thinking);
    const r = await runAgent({ binary: "opencode", argv, promptDelivery: "stdin", ...args });
    if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true as const };
    return r;
  },
};
