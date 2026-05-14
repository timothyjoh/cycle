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
  priority: number;
};

export type ParsedArgs = RunArgs | DropArgs;

export function parseArgs(argv: string[]): ParsedArgs {
  if (argv[0] === "drop") {
    let values: Record<string, unknown>;
    let positionals: string[];
    try {
      ({ values, positionals } = nodeParseArgs({
        args: argv.slice(1),
        options: {
          priority: { type: "string" },
        },
        allowPositionals: true,
      }));
    } catch (err) {
      throw new Error(
        `drop: ${(err as Error).message} (usage: cycle drop "<text>" [--priority N]; N is an integer 1..10, default 3)`,
      );
    }

    const text = positionals.join(" ").trim();
    if (!text) throw new Error("drop requires task text");

    let priority = 3;
    if (values.priority !== undefined) {
      const raw = String(values.priority);
      const n = Number(raw);
      if (!/^-?\d+$/.test(raw) || !Number.isInteger(n) || n < 1 || n > 10) {
        throw new Error(
          `drop: --priority must be an integer 1..10 (got "${raw}"); usage: cycle drop "<text>" [--priority N]`,
        );
      }
      priority = n;
    }

    return { command: "drop", text, priority };
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
