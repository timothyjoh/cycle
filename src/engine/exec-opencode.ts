import { runAgent } from "./exec-spawn.ts";
import type { ExecModule } from "./exec.ts";

// TODO: opencode flag names (--model, --thinking) are assumed from codex/auggie parity;
// verify against `opencode --help` once opencode CLI stabilizes.
export const opencodeExec: ExecModule = {
  runStep({ model, thinking, ...args }) {
    const argv: string[] = [];
    if (model) argv.push("--model", model);
    if (thinking) argv.push("--thinking", thinking);
    return runAgent({ binary: "opencode", argv, promptDelivery: "stdin", ...args });
  },
};
