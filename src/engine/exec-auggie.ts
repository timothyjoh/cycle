import { runAgent } from "./exec-spawn.ts";
import type { ExecModule } from "./exec.ts";

// auggie has no --thinking flag; thinking param is intentionally unused.
// CYCLE_AUGGIE_BIN allows tests to inject an absolute path to a fake binary,
// bypassing PATH lookup (necessary when a real `auggie` exists in nodeBinDir).
export const auggieExec: ExecModule = {
  runStep({ model, thinking, ...args }) {
    const binary = process.env.CYCLE_AUGGIE_BIN ?? "auggie";
    const argv: string[] = ["--print", "--instruction-file"];
    if (model) argv.push("--model", model);
    return runAgent({ binary, argv, promptDelivery: "file", ...args });
  },
};
