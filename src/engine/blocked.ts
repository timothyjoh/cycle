import type { Logger } from "./log.ts";

export async function propagateBlocked(
  _repoRoot: string,
  failedId: string,
  log?: Logger,
): Promise<{ blocked: string[] }> {
  if (log) {
    await log.emit("queue.propagate_blocked", { issue_id: failedId, blocked: [] });
  }
  return { blocked: [] };
}
