import { parseArgs as nodeParseArgs } from "node:util";
import { DEFAULT_WORKFLOW } from "./validate-workflow.ts";

export type RunArgs = {
  command: "run";
  text: string | null;
  workflow: string;
  /**
   * Three-state raw `--workflow` signal for the start-path validation gate:
   * `undefined` ⇒ flag absent (defaults to `feature`, never rejected);
   * `""` ⇒ flag present with no value (the value-less signal the gate rejects);
   * a string ⇒ the explicit value (validated against the config workflow set).
   * `workflow` stays a concrete string for every existing consumer.
   */
  workflowExplicit: string | undefined;
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

  // Extract `--workflow` manually (parity with the doctor dispatch's
  // `rest[wfIdx + 1] ?? ""`) so a trailing value-less `--workflow` no longer
  // throws `Option '--workflow <value>' argument missing` uncaught, and a
  // following flag is not silently consumed as the value. Flag absent ⇒
  // `undefined` (defaults to "feature"); flag present, no value ⇒ "" (the
  // value-less signal the gate rejects). Both the space form
  // (`--workflow <name>`) and the equals form (`--workflow=<name>`, which the
  // old `node:util` parser accepted) are recognized and stripped from the args
  // fed to `nodeParseArgs` so neither falls through as an unknown option.
  const runArgv = argv.slice(1);
  const eqIdx = runArgv.findIndex((a) => a.startsWith("--workflow="));
  const spaceIdx = runArgv.indexOf("--workflow");
  let workflowExplicit: string | undefined;
  let nodeArgs: string[];
  if (eqIdx >= 0) {
    // `--workflow=feature` ⇒ "feature"; `--workflow=` ⇒ "" (value-less,
    // rejected by the gate, consistent with the space form).
    workflowExplicit = runArgv[eqIdx].slice("--workflow=".length);
    nodeArgs = runArgv.filter((_, i) => i !== eqIdx);
  } else if (spaceIdx >= 0) {
    workflowExplicit = runArgv[spaceIdx + 1] ?? "";
    nodeArgs = runArgv.filter((_, i) => i !== spaceIdx && i !== spaceIdx + 1);
  } else {
    workflowExplicit = undefined;
    nodeArgs = runArgv;
  }

  const { values, positionals } = nodeParseArgs({
    args: nodeArgs,
    options: {
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
    workflow: workflowExplicit === undefined ? DEFAULT_WORKFLOW : workflowExplicit,
    workflowExplicit,
    dryRun: Boolean(values["dry-run"]),
    noSkipCompleted: Boolean(values["no-skip-completed"]),
    trunk: Boolean(values.trunk),
    skipPreflight: Boolean(values["skip-preflight"]),
  };
}
