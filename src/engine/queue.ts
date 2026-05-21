import { readFile, writeFile, rename, appendFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

export type QueueRowStatus = "pending" | "in_progress";

export type Priority = "low" | "medium" | "high" | "critical" | "discuss";

const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0, high: 1, medium: 2, low: 3, discuss: 4,
};

export function normalizePriority(raw: unknown): Priority {
  if (raw === "low" || raw === "medium" || raw === "high" || raw === "critical" || raw === "discuss") return raw;
  if (typeof raw === "number") {
    if (raw >= 7) return "critical";
    if (raw >= 5) return "high";
    if (raw >= 3) return "medium";
    return "low";
  }
  return "medium";
}

export type QueueRow = {
  id: string;
  parent?: string;
  title: string;
  status: QueueRowStatus;
  attempt: number;
  depends_on: string[];
  triaged_at: string;
  cycle_id?: string;
  priority: Priority;
};

function queuePath(repoRoot: string): string {
  return join(repoRoot, ".cycle", "tbd.jsonl");
}

async function ensureCycleDir(repoRoot: string): Promise<void> {
  await mkdir(join(repoRoot, ".cycle"), { recursive: true });
}

export function isLegacyLine(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== "object") return false;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.id !== "string") return false;
  return obj.status === undefined;
}

function isQueueRow(parsed: unknown): parsed is QueueRow {
  if (!parsed || typeof parsed !== "object") return false;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.id !== "string") return false;
  if (typeof obj.title !== "string") return false;
  if (obj.status !== "pending" && obj.status !== "in_progress") return false;
  if (typeof obj.attempt !== "number") return false;
  if (!Array.isArray(obj.depends_on)) return false;
  if (typeof obj.triaged_at !== "string") return false;
  if (obj.priority !== "low" && obj.priority !== "medium" && obj.priority !== "high" &&
      obj.priority !== "critical" && obj.priority !== "discuss") return false;
  return true;
}

export async function readQueue(repoRoot: string): Promise<QueueRow[]> {
  const path = queuePath(repoRoot);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const rows: QueueRow[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (parsed && typeof parsed === "object") {
      const o = parsed as Record<string, unknown>;
      o.priority = normalizePriority(o.priority ?? o.priority_hint);
      delete o.priority_hint;
    }
    if (!isQueueRow(parsed)) continue;
    rows.push(parsed);
  }
  return rows;
}

export async function writeQueue(repoRoot: string, rows: QueueRow[]): Promise<void> {
  await ensureCycleDir(repoRoot);
  const path = queuePath(repoRoot);
  const body = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  const tmp = path + ".tmp";
  await writeFile(tmp, body, "utf8");
  await rename(tmp, path);
}

export async function appendRow(repoRoot: string, row: QueueRow): Promise<void> {
  await ensureCycleDir(repoRoot);
  await appendFile(queuePath(repoRoot), JSON.stringify(row) + "\n", "utf8");
}

async function pickArchivePath(repoRoot: string): Promise<string> {
  const base = join(repoRoot, ".cycle", "tbd.jsonl.bootstrap-archive");
  try {
    await stat(base);
  } catch {
    return base;
  }
  for (let i = 1; i < 1000; i++) {
    const candidate = `${base}.${i}`;
    try {
      await stat(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error("too many bootstrap archives");
}

export async function bootstrapArchiveIfLegacy(repoRoot: string): Promise<boolean> {
  const path = queuePath(repoRoot);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
  let hasLegacy = false;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (isLegacyLine(parsed)) {
      hasLegacy = true;
      break;
    }
  }
  if (!hasLegacy) return false;
  const archive = await pickArchivePath(repoRoot);
  try {
    await rename(path, archive);
  } catch (e: unknown) {
    throw Object.assign(
      new Error(`bootstrapArchiveIfLegacy: rename failed: ${(e as Error).message}`),
      { code: (e as NodeJS.ErrnoException).code }
    );
  }
  return true;
}

export async function popNextPending(repoRoot: string): Promise<QueueRow | null> {
  const rows = await readQueue(repoRoot);
  const allIds = new Set(rows.map((r) => r.id));
  const pending = rows
    .filter((r) => r.status === "pending")
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  for (const row of pending) {
    const blocked = row.depends_on.some((dep) => allIds.has(dep) && dep !== row.id);
    if (!blocked) return row;
  }
  return null;
}

export async function markInProgress(repoRoot: string, id: string, cycleId: string): Promise<void> {
  const rows = await readQueue(repoRoot);
  let touched = false;
  for (const r of rows) {
    if (r.id !== id) continue;
    if (r.status === "in_progress" && r.cycle_id && r.cycle_id !== cycleId) {
      throw new Error(
        `markInProgress: row ${id} already in_progress for cycle ${r.cycle_id}, refusing to overwrite with ${cycleId}`,
      );
    }
    r.status = "in_progress";
    r.cycle_id = cycleId;
    touched = true;
  }
  if (!touched) throw new Error(`markInProgress: id not found: ${id}`);
  await writeQueue(repoRoot, rows);
}

export async function drainOk(repoRoot: string, id: string): Promise<void> {
  const rows = await readQueue(repoRoot);
  const next = rows.filter((r) => r.id !== id);
  await writeQueue(repoRoot, next);
}

export async function drainFailedRetry(repoRoot: string, id: string): Promise<void> {
  const rows = await readQueue(repoRoot);
  for (const r of rows) {
    if (r.id === id) {
      r.attempt += 1;
      r.status = "pending";
      // cycle_id intentionally preserved: the next pop reuses it so runCycle's
      // artifactDir matches the prior attempt's dir, letting the pre-build skip
      // gate (src/engine/run-cycle.ts) see SPEC.md/RESEARCH.md/PLAN.md left
      // behind on the cycle branch.
    }
  }
  await writeQueue(repoRoot, rows);
}

export async function drainFailedTerminal(repoRoot: string, id: string): Promise<void> {
  const rows = await readQueue(repoRoot);
  const next = rows.filter((r) => r.id !== id);
  await writeQueue(repoRoot, next);
}
