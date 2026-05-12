import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function allocateCycleId(repoRoot: string): Promise<string> {
  let highest = 0;
  try {
    const log = await readFile(join(repoRoot, ".cycle/log.jsonl"), "utf8");
    for (const line of log.split("\n")) {
      if (!line) continue;
      try {
        const e = JSON.parse(line);
        const id = typeof e.cycle_id === "string" ? parseInt(e.cycle_id, 10) : NaN;
        if (!Number.isNaN(id) && id > highest) highest = id;
      } catch { /* skip */ }
    }
  } catch { /* no log yet */ }
  return String(highest + 1).padStart(4, "0");
}
