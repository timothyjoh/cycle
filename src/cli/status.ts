import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readQueue } from "../engine/queue.ts";
import { readLogTail } from "../engine/log-tail.ts";

export const ISSUE_FOLDERS = ["raw", "todo", "done", "failed", "blocked"] as const;
export type IssueFolder = (typeof ISSUE_FOLDERS)[number];

async function countMd(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir);
    return entries.filter((f) => f.endsWith(".md")).length;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw e;
  }
}

export async function runStatus({ cwd }: { cwd: string }): Promise<string> {
  const counts: Record<IssueFolder, number> = {
    raw: 0,
    todo: 0,
    done: 0,
    failed: 0,
    blocked: 0,
  };
  for (const name of ISSUE_FOLDERS) {
    counts[name] = await countMd(join(cwd, "docs/cycle/issues", name));
  }

  const rows = await readQueue(cwd);
  const pending = rows.filter((r) => r.status === "pending").length;
  const inProgress = rows.filter((r) => r.status === "in_progress");
  const tail = await readLogTail(cwd);

  const lines: string[] = [];
  for (const name of ISSUE_FOLDERS) lines.push(`${name}: ${counts[name]}`);
  lines.push("");
  lines.push(`queue_total: ${rows.length}`);
  lines.push(`queue_pending: ${pending}`);
  lines.push(`queue_in_progress: ${inProgress.length}`);
  for (const r of inProgress) {
    lines.push(`  - id=${r.id} cycle_id=${r.cycle_id ?? "-"}`);
  }
  lines.push("");
  if (tail) {
    lines.push(`in_flight: ${tail.cycleId} step=${tail.lastStepStarted ?? "-"}`);
  } else {
    lines.push("in_flight: none");
  }
  return lines.join("\n");
}
