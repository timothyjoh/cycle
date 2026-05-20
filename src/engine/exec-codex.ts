import { runAgent } from "./exec-spawn.ts";
import type { ExecModule } from "./exec.ts";

export const codexExec: ExecModule = {
  runStep({ model, thinking, ...args }) {
    const argv: string[] = [];
    if (model) argv.push("--model", model);
    if (thinking) argv.push("--thinking", thinking);
    return runAgent({ binary: "codex", argv, promptDelivery: "stdin", ...args });
  },
};
