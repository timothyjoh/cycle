import { parseArgs as nodeParseArgs } from "node:util";

export type RunArgs = {
  command: "run";
  text: string | null;
  workflow: string;
  dryRun: boolean;
  noSkipCompleted: boolean;
  trunk: boolean;
  skipPreflight: boolean;
};

export type DropArgs = {
  command: "drop";
  text: string;
};

export type ParsedArgs = RunArgs | DropArgs;

export function parseArgs(argv: string[]): ParsedArgs {
  if (argv[0] === "drop") {
    let positionals: string[];
    try {
      ({ positionals } = nodeParseArgs({
        args: argv.slice(1),
        options: {},
        allowPositionals: true,
      }));
    } catch (err) {
      throw new Error(
        `drop: ${(err as Error).message} (usage: cycle drop "<text>")`,
      );
    }

    const text = positionals.join(" ").trim();
    if (!text) throw new Error("drop requires task text");

    return { command: "drop", text };
  }

  if (argv.length > 0 && argv[0] !== "run") throw new Error(`unknown command: ${argv[0]}`);

  const { values, positionals } = nodeParseArgs({
    args: argv.slice(1),
    options: {
      workflow: { type: "string", default: "feature" },
      "dry-run": { type: "boolean", default: false },
      "no-skip-completed": { type: "boolean", default: false },
      trunk: { type: "boolean", default: false },
      "skip-preflight": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const text = positionals.join(" ").trim();

  return {
    command: "run",
    text: text === "" ? null : text,
    workflow: String(values.workflow),
    dryRun: Boolean(values["dry-run"]),
    noSkipCompleted: Boolean(values["no-skip-completed"]),
    trunk: Boolean(values.trunk),
    skipPreflight: Boolean(values["skip-preflight"]),
  };
}
