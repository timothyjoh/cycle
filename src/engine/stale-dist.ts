import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "./log.ts";

type StatFn = (path: string) => Promise<{ mtimeMs: number }>;

export async function emitStaleDistWarning(
  log: Logger,
  processStart: number,
  cwd: string,
  statFn: StatFn = stat,
): Promise<void> {
  const distPath = join(cwd, "dist", "cycle.js");
  let mtimeMs: number;
  try {
    const s = await statFn(distPath);
    mtimeMs = s.mtimeMs;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
    throw e;
  }
  if (mtimeMs <= processStart) return;
  await log.emit("engine.warning", {
    reason: "stale_dist",
    dist_mtime: mtimeMs,
    process_start: processStart,
    dist_path: distPath,
    message: `dist/cycle.js (${new Date(mtimeMs).toISOString()}) is newer than this process (${new Date(processStart).toISOString()}); restart the engine to pick up the latest build`,
  });
}
