import { cp, mkdir, stat, chmod, copyFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { locateEngineBundle, locateDefaultsDir } from "./init.ts";

export type UpgradeResult = { exitCode: number; stdout: string; stderr: string };

const KNOWN_FLAGS = [
  "--overwrite-prompts",
  "--overwrite-workflows",
  "--overwrite-scripts",
  "--overwrite-all",
];

// `cycle upgrade` — non-destructive in-place engine refresh. ALWAYS refreshes
// the never-edited engine artifacts (.cycle/bin/cycle.js, .cycle/package.json),
// DEFAULT-PRESERVES the three user-editable config categories, overwrites each
// only under its own flag, and NEVER touches state files (.cycle/.env,
// .cycle/tbd.jsonl, .cycle/log.jsonl, docs/cycle/issues/**). State preservation
// is structural: no write path below ever names a state file.
export async function runUpgrade(
  opts: { targetRoot: string; argv: string[] },
): Promise<UpgradeResult> {
  const { targetRoot: t, argv } = opts;

  // 1. Unknown-flag guard (before any I/O) — cleanup.ts convention.
  const unknown = argv.filter((a) => a.startsWith("-") && !KNOWN_FLAGS.includes(a));
  if (unknown.length > 0) {
    return { exitCode: 1, stdout: "", stderr: "Unknown flag(s): " + unknown.join(", ") };
  }

  const all = argv.includes("--overwrite-all");
  const owPrompts = all || argv.includes("--overwrite-prompts");
  const owWorkflows = all || argv.includes("--overwrite-workflows");
  const owScripts = all || argv.includes("--overwrite-scripts");

  // 2. Initialized guard (before any write). A missing or non-directory
  //    .cycle/ surfaces a clear error pointing at `cycle init`; no partial
  //    scaffold is written.
  try {
    const sb = await stat(join(t, ".cycle"));
    if (!sb.isDirectory()) throw new Error("not a directory");
  } catch {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "cycle upgrade: no .cycle/ found in " + t + " — run `cycle init` first.",
    };
  }

  // 3. Locate sources. These throw on failure and the error propagates
  //    uncaught (never swallowed) → non-zero process exit.
  const enginePath = await locateEngineBundle();
  const defaults = await locateDefaultsDir();

  // 4. ALWAYS refresh engine artifacts (mirrors init.ts exactly, incl. the
  //    exact package.json literal so always-refresh assertions hold).
  await mkdir(join(t, ".cycle/bin"), { recursive: true });
  await copyFile(enginePath, join(t, ".cycle/bin/cycle.js"));
  await chmod(join(t, ".cycle/bin/cycle.js"), 0o755);
  await writeFile(
    join(t, ".cycle/package.json"),
    JSON.stringify({ type: "module", private: true }, null, 2) + "\n",
  );

  const refreshed = [".cycle/bin/cycle.js", ".cycle/package.json"];
  const preserved: string[] = [];
  const overwritten: string[] = [];

  // 5. Per-category opt-in overwrite. workflows.yml is a single file
  //    (plain copyFile); prompts/scripts are directories cleaned-replaced
  //    (rm then cp) so a stale user-added file does not survive an explicit
  //    opt-in overwrite. The default-preserve path performs no write at all.
  if (owWorkflows) {
    await copyFile(join(defaults, "workflows.yml"), join(t, ".cycle/workflows.yml"));
    overwritten.push(".cycle/workflows.yml");
  } else {
    preserved.push(".cycle/workflows.yml");
  }

  for (const [flag, name] of [
    [owPrompts, "prompts"],
    [owScripts, "scripts"],
  ] as const) {
    const dest = join(t, ".cycle", name);
    if (flag) {
      await rm(dest, { recursive: true, force: true });
      await cp(join(defaults, name), dest, { recursive: true });
      overwritten.push(`.cycle/${name}/`);
    } else {
      preserved.push(`.cycle/${name}/`);
    }
  }

  // 6. Summary (human-readable stdout).
  const lines = [
    "cycle upgrade complete.",
    "  Refreshed (engine): " + refreshed.join(", "),
  ];
  if (overwritten.length) {
    lines.push("  Overwritten (from defaults): " + overwritten.join(", "));
  }
  if (preserved.length) {
    lines.push("  Preserved (user config): " + preserved.join(", "));
  }
  lines.push(
    "  Untouched (state): .cycle/.env, .cycle/tbd.jsonl, .cycle/log.jsonl, docs/cycle/issues/**",
  );

  return { exitCode: 0, stdout: lines.join("\n") + "\n", stderr: "" };
}
