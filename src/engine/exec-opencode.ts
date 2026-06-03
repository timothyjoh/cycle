import { runAgent } from "./exec-spawn.ts";
import { isRateLimitError } from "./rate-limit.ts";
import type { ExecModule } from "./exec.ts";

// TODO: opencode flag names (--model, --thinking) are assumed from codex/auggie parity;
// verify against `opencode --help` once opencode CLI stabilizes.
export const opencodeExec: ExecModule = {
  async runStep({ model, thinking, ...args }) {
    // opencode's non-interactive entrypoint is the `run` subcommand. Bare
    // `opencode` starts the interactive TUI on a non-TTY stdin (confirmed
    // locally: emits raw terminal escape sequences instead of processing the
    // prompt), so `run` must lead the argv. `opencode run [message..]` takes the
    // prompt as a documented positional argv, so the prompt is delivered as the
    // trailing positional (promptDelivery: "argv") — mirrors the `codex exec`
    // non-TTY fix.
    const argv: string[] = ["run"];
    if (model) argv.push("--model", model);
    if (thinking) argv.push("--thinking", thinking);
    // CYCLE_OPENCODE_BIN lets tests inject an absolute path to a fake binary so
    // a real `opencode` on PATH (e.g. node's bin dir, which buildChildEnv
    // prepends) cannot shadow the stub. Mirrors CYCLE_AUGGIE_BIN / CYCLE_PI_BIN.
    const binary = process.env.CYCLE_OPENCODE_BIN ?? "opencode";
    const r = await runAgent({ binary, argv, promptDelivery: "argv", ...args });
    if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true as const };
    return r;
  },
};
