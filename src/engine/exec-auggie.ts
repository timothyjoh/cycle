import { runAgent } from "./exec-spawn.ts";
import type { ExecModule } from "./exec.ts";

// TODO: auggie flag names (--model, --thinking) are assumed from codex parity;
// verify against `auggie --help` once auggie CLI stabilizes.
export const auggieExec: ExecModule = {
  runStep({ model, thinking, ...args }) {
    const argv: string[] = [];
    if (model) argv.push("--model", model);
    if (thinking) argv.push("--thinking", thinking);
    return runAgent({ binary: "auggie", argv, promptDelivery: "stdin", ...args });
  },
};
