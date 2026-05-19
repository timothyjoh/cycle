import { runAgent } from "./exec-spawn.ts";
import type { ExecModule } from "./exec.ts";

export const geminiExec: ExecModule = {
  runStep(args) {
    return runAgent({ binary: "gemini", argv: [], promptDelivery: "stdin", ...args });
  },
};
