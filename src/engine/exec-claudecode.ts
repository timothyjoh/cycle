import { runAgent } from "./exec-spawn.ts";
import type { ExecModule } from "./exec.ts";

export const claudecodeExec: ExecModule = {
  runStep(args) {
    return runAgent({ binary: "claude", argv: ["--dangerously-skip-permissions", "-p"], promptDelivery: "argv", ...args });
  },
};
