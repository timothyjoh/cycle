import { runAgent } from "./exec-spawn.ts";
import type { ExecModule } from "./exec.ts";

// --model and --thinking are assumed from codex parity; verify against `auggie --help`.
export const auggieExec: ExecModule = {
  runStep({ model, thinking, ...args }) {
    const argv: string[] = ["--print"];
    if (model) argv.push("--model", model);
    if (thinking) argv.push("--thinking", thinking);
    return runAgent({ binary: "auggie", argv, promptDelivery: "argv", ...args });
  },
};
