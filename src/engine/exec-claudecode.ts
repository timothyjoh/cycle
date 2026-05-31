import { runAgent } from "./exec-spawn.ts";
import { isRateLimitError } from "./rate-limit.ts";
import type { ExecModule } from "./exec.ts";

export const claudecodeExec: ExecModule = {
  async runStep({ appendSystemPrompt, model, thinking, settingsPath, ...args }) {
    // `--permission-mode auto` (classifier-based approval) rather than
    // `--dangerously-skip-permissions`: the latter is refused by the claude CLI
    // when running as root (containers/CI/WSL) unless IS_SANDBOX=1 is set. `auto`
    // has no root guard and is the safer long-term default. A configurable
    // permission mode is tracked in feat-configurable-permission-mode.
    const argv: string[] = ["--permission-mode", "auto"];
    if (appendSystemPrompt) argv.push("--append-system-prompt", appendSystemPrompt);
    if (model) argv.push("--model", model);
    // claude CLI has no thinking flag; `thinking` is destructured only to strip
    // it from `...args` (so it never reaches runAgent) and is intentionally unused.
    // Compress-output hook (opt-in): insert `--settings <path>` before `-p` only
    // when run-cycle materialized a settings file. Absent ⇒ argv is byte-for-byte
    // identical to the pre-change baseline (default-off contract).
    if (settingsPath) argv.push("--settings", settingsPath);
    argv.push("-p");
    const r = await runAgent({ binary: "claude", argv, promptDelivery: "argv", ...args });
    if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true as const };
    return r;
  },
};
