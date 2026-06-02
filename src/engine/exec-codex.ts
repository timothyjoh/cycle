import { runAgent } from "./exec-spawn.ts";
import { isRateLimitError } from "./rate-limit.ts";
import type { ExecModule } from "./exec.ts";

export const codexExec: ExecModule = {
  async runStep({ model, thinking, ...args }) {
    const argv: string[] = [];
    if (model) argv.push("--model", model);
    if (thinking) argv.push("--thinking", thinking);
    // CYCLE_CODEX_BIN lets tests inject an absolute path to a fake binary so a
    // real `codex` on PATH (e.g. node's bin dir, which buildChildEnv prepends
    // ahead of the caller's PATH) cannot shadow the stub. Mirrors
    // CYCLE_AUGGIE_BIN / CYCLE_PI_BIN.
    const binary = process.env.CYCLE_CODEX_BIN ?? "codex";
    const r = await runAgent({ binary, argv, promptDelivery: "stdin", ...args });
    if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true as const };
    return r;
  },
};
