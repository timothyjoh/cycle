import { runAgent } from "./exec-spawn.ts";
import { isRateLimitError } from "./rate-limit.ts";
import type { ExecModule } from "./exec.ts";

export const geminiExec: ExecModule = {
  async runStep({ model, thinking, ...args }) {
    const argv: string[] = [];
    if (model) argv.push("--model", model);
    // gemini CLI has no thinking flag here; `thinking` is destructured only to
    // strip it from `...args` (so it never reaches runAgent) and is intentionally unused.
    // CYCLE_GEMINI_BIN lets tests inject an absolute path to a fake binary so a
    // real `gemini` on PATH (e.g. node's bin dir, which buildChildEnv prepends)
    // cannot shadow the stub. Mirrors CYCLE_AUGGIE_BIN / CYCLE_PI_BIN.
    const binary = process.env.CYCLE_GEMINI_BIN ?? "gemini";
    const r = await runAgent({ binary, argv, promptDelivery: "stdin", ...args });
    if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true as const };
    return r;
  },
};
