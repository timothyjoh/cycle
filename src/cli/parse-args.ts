import { parseArgs as nodeParseArgs } from "node:util";

export type RunArgs = {
  command: "run";
  text: string | null;
  workflow: string;
  dryRun: boolean;
};

export type DropArgs = {
  command: "drop";
  text: string;
};

export type ParsedArgs = RunArgs | DropArgs;

export function parseArgs(argv: string[]): ParsedArgs {
  if (argv[0] === "drop") {
    const text = argv.slice(1).join(" ").trim();
    if (!text) throw new Error("drop requires task text");
    return { command: "drop", text };
  }

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

  return {
    command: "run",
    text: text === "" ? null : text,
    workflow: String(values.workflow),
    dryRun: Boolean(values["dry-run"]),
  };
}
