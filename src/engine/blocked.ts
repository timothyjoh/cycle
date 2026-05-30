import { rename } from "node:fs/promises";
import { join } from "node:path";
import { readQueue, writeQueue } from "./queue.ts";
import type { QueueRow } from "./queue.ts";
import { mutateFrontmatter } from "./frontmatter.ts";
import type { Logger } from "./log.ts";

type StagedMove = { row: QueueRow; predecessors: string[] };

export async function propagateBlocked(
  repoRoot: string,
  failedId: string,
  log?: Logger,
  renameFn: (src: string, dst: string) => Promise<void> = rename,
): Promise<{ blocked: string[] }> {
  const todoDir = join(repoRoot, "docs/cycle/issues/todo");
  const blockedDir = join(repoRoot, "docs/cycle/issues/blocked");

  const rows = await readQueue(repoRoot);
  const visited = new Set<string>([failedId]);
  const orderedMoves: StagedMove[] = [];

  let frontier = new Set<string>([failedId]);
  while (frontier.size > 0) {
    const next = new Set<string>();
    for (const r of rows) {
      if (visited.has(r.id)) continue;
      const preds = r.depends_on.filter((d) => frontier.has(d));
      if (preds.length === 0) continue;
      orderedMoves.push({ row: r, predecessors: preds });
      visited.add(r.id);
      next.add(r.id);
    }
    frontier = next;
  }

  const blocked: string[] = [];
  const rollback: Array<() => Promise<void>> = [];
  try {
    for (const { row, predecessors } of orderedMoves) {
      const src = join(todoDir, `${row.id}.md`);
      const dst = join(blockedDir, `${row.id}.md`);
      await mutateFrontmatter(src, (fm) => ({
        ...fm,
        blocked_at: new Date().toISOString(),
        blocked_by: predecessors,
      }));
      await renameFn(src, dst);
      rollback.push(async () => {
        try {
          await renameFn(dst, src);
        } catch {
          // best-effort rollback; original todo path may already be partially restored
        }
      });
      blocked.push(row.id);
    }
    if (orderedMoves.length > 0) {
      const movedIds = new Set(orderedMoves.map((m) => m.row.id));
      await writeQueue(repoRoot, rows.filter((r) => !movedIds.has(r.id)));
    }
  } catch (err) {
    for (const undo of rollback.reverse()) await undo();
    throw err;
  }

  if (log) {
    for (const m of orderedMoves) {
      await log.emit("issue.blocked", { issue_id: m.row.id, blocked_by: m.predecessors });
    }
    await log.emit("queue.propagate_blocked", { issue_id: failedId, blocked });
  }
  return { blocked };
}
