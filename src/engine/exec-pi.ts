import { runAgent } from "./exec-spawn.ts";
import type { ExecModule } from "./exec.ts";

// TODO: pi flag names (--model, --thinking) are assumed from codex/auggie/opencode parity;
// verify against `pi --help` once pi CLI stabilizes.
export const piExec: ExecModule = {
  runStep({ model, thinking, ...args }) {
    // CYCLE_PI_BIN allows tests to inject an absolute path to a fake binary,
    // bypassing PATH lookup (necessary when a real `pi` exists in nodeBinDir).
    const binary = process.env.CYCLE_PI_BIN ?? "pi";
    const argv: string[] = [];
    if (model) argv.push("--model", model);
    if (thinking) argv.push("--thinking", thinking);
    return runAgent({ binary, argv, promptDelivery: "stdin", ...args });
  },
};
