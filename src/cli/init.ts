import { cp, mkdir, stat, chmod, copyFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

export async function runInit(opts: { targetRoot: string; force: boolean }) {
  const t = opts.targetRoot;

  const enginePath = await locateEngineBundle();

  await mkdir(join(t, ".cycle/bin"), { recursive: true });
  await copyFile(enginePath, join(t, ".cycle/bin/cycle.js"));
  await chmod(join(t, ".cycle/bin/cycle.js"), 0o755);

  // The engine bundle is ESM. Node decides ESM vs CJS by walking up from the
  // file to the nearest package.json; without "type": "module" here the
  // bundle fails on its first `import` in any consumer repo that has no
  // root package.json (or whose root package.json is not module-typed).
  await writeFile(
    join(t, ".cycle/package.json"),
    JSON.stringify({ type: "module", private: true }, null, 2) + "\n",
  );

  const defaults = await locateDefaultsDir();
  await mkdir(join(t, ".cycle"), { recursive: true });
  await copyFile(join(defaults, "workflows.yml"), join(t, ".cycle/workflows.yml"));
  await cp(join(defaults, "prompts"), join(t, ".cycle/prompts"), { recursive: true });
  await cp(join(defaults, "scripts"), join(t, ".cycle/scripts"), { recursive: true });

  for (const sub of ["ideas", "inbox", "todo", "done", "blocked", "failed"]) {
    await mkdir(join(t, "docs/cycle/issues", sub), { recursive: true });
  }
}

async function locateEngineBundle(): Promise<string> {
  const candidates = [
    join(HERE, "..", "..", "dist", "cycle.js"),
    join(HERE, "..", "dist", "cycle.js"),
    join(HERE, "cycle.js"),
  ];
  for (const c of candidates) {
    try { await stat(c); return c; } catch { /* try next */ }
  }
  throw new Error("init: could not locate dist/cycle.js");
}

async function locateDefaultsDir(): Promise<string> {
  // When running from a bundled dist/cycle.js: dist/defaults sits beside it.
  // When running from local source (src/cli/init.ts): src/defaults is two up.
  // When running from npm-installed @cycleai/cli: dist/defaults too.
  const candidates = [
    join(HERE, "defaults"),               // dist/defaults next to dist/cycle.js
    join(HERE, "..", "defaults"),         // dist/../defaults
    join(HERE, "..", "..", "src", "defaults"),  // local dev from src/cli/
    join(HERE, "..", "src", "defaults"),  // local dev from src/
  ];
  for (const c of candidates) {
    try { await stat(c); return c; } catch { /* try next */ }
  }
  throw new Error(`init: could not locate defaults; tried ${candidates.join(", ")}`);
}
