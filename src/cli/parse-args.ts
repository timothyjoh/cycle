import { parseArgs as nodeParseArgs } from "node:util";

export type RunArgs = {
  command: "run";
  text: string;
  workflow: string;
  dryRun: boolean;
};

export function parseArgs(argv: string[]): RunArgs {
  if (argv[0] !== "run") throw new Error(`unknown command: ${argv[0] ?? "(none)"}`);

  const { values, positionals } = nodeParseArgs({
    args: argv.slice(1),
    options: {
      workflow: { type: "string", default: "feature" },
      "dry-run": { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const text = positionals.join(" ").trim();
  if (!text) throw new Error("run requires a task text positional");

  return {
    command: "run",
    text,
    workflow: String(values.workflow),
    dryRun: Boolean(values["dry-run"]),
  };
}
