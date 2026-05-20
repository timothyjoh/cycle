import { runAgent } from "./exec-spawn.ts";
import type { ExecModule } from "./exec.ts";

// TODO: pi flag names (--model, --thinking) are assumed from codex/auggie/opencode parity;
// verify against `pi --help` once pi CLI stabilizes.
export const piExec: ExecModule = {
  runStep({ model, thinking, ...args }) {
    const argv: string[] = [];
    if (model) argv.push("--model", model);
    if (thinking) argv.push("--thinking", thinking);
    return runAgent({ binary: "pi", argv, promptDelivery: "stdin", ...args });
  },
};
