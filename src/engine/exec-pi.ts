import { runAgent } from "./exec-spawn.ts";
import { isRateLimitError } from "./rate-limit.ts";
import type { ExecModule } from "./exec.ts";

// TODO: pi flag names (--model, --thinking) are assumed from codex/auggie/opencode parity;
// verify against `pi --help` once pi CLI stabilizes.
export const piExec: ExecModule = {
  async runStep({ model, thinking, ...args }) {
    // CYCLE_PI_BIN allows tests to inject an absolute path to a fake binary,
    // bypassing PATH lookup (necessary when a real `pi` exists in nodeBinDir).
    const binary = process.env.CYCLE_PI_BIN ?? "pi";
    // pi's non-interactive entrypoint is `--print` ("process prompt and exit").
    // Bare `pi` defaults to the interactive mode and hangs on a piped (non-TTY)
    // stdin (confirmed locally: `echo … | pi` times out), so `--print` must
    // lead the argv. `--print` still reads the prompt from piped stdin, so the
    // stdin delivery is preserved — mirrors the `codex exec` non-TTY fix.
    const argv: string[] = ["--print"];
    if (model) argv.push("--model", model);
    if (thinking) argv.push("--thinking", thinking);
    const r = await runAgent({ binary, argv, promptDelivery: "stdin", ...args });
    if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true as const };
    return r;
  },
};
