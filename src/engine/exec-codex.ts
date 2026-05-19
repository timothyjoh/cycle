import { runAgent } from "./exec-spawn.ts";
import type { ExecModule } from "./exec.ts";

export const codexExec: ExecModule = {
  runStep(args) {
    return runAgent({ binary: "codex", argv: [], promptDelivery: "stdin", ...args });
  },
};
