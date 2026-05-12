import { cp, mkdir, stat, chmod, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

export async function runInit(opts: { targetRoot: string; force: boolean }) {
  const t = opts.targetRoot;

  const enginePath = await locateEngineBundle();

  await mkdir(join(t, ".cycle/bin"), { recursive: true });
  await copyFile(enginePath, join(t, ".cycle/bin/cycle.js"));
  await chmod(join(t, ".cycle/bin/cycle.js"), 0o755);

  const defaults = await locateDefaultsDir();
  await cp(join(defaults, "workflows"), join(t, ".cycle/workflows"), { recursive: true });
  await cp(join(defaults, "prompts"), join(t, ".cycle/prompts"), { recursive: true });
  await cp(join(defaults, "scripts"), join(t, ".cycle/scripts"), { recursive: true });

  for (const sub of ["tbd", "queued", "triaged", "blocked", "failed"]) {
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
  const candidates = [
    join(HERE, "..", "..", "src", "defaults"),
    join(HERE, "..", "defaults"),
    join(HERE, "defaults"),
  ];
  for (const c of candidates) {
    try { await stat(c); return c; } catch { /* try next */ }
  }
  throw new Error("init: could not locate src/defaults");
}
