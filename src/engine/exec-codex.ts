import { runAgent } from "./exec-spawn.ts";
import { isRateLimitError } from "./rate-limit.ts";
import type { ExecModule } from "./exec.ts";

export const codexExec: ExecModule = {
  async runStep({ model, thinking, ...args }) {
    // codex's non-interactive entrypoint is the `exec` subcommand. Bare `codex`
    // is the interactive TUI and rejects a piped (non-TTY) stdin with
    // "Error: stdin is not a terminal" on codex-cli >= 0.136, so the prompt
    // (delivered over stdin) must go to `codex exec`.
    const argv: string[] = ["exec"];
    if (model) argv.push("--model", model);
    // `codex exec` has no `--thinking` flag; map the thinking level to codex's
    // reasoning effort via a `-c` config override (value parsed as TOML).
    if (thinking) argv.push("-c", `model_reasoning_effort="${thinking}"`);
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
