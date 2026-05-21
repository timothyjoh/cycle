import { runAgent } from "./exec-spawn.ts";
import type { ExecModule } from "./exec.ts";

export const claudecodeExec: ExecModule = {
  runStep({ appendSystemPrompt, ...args }) {
    const argv: string[] = ["--dangerously-skip-permissions"];
    if (appendSystemPrompt) argv.push("--append-system-prompt", appendSystemPrompt);
    argv.push("-p");
    return runAgent({ binary: "claude", argv, promptDelivery: "argv", ...args });
  },
};
