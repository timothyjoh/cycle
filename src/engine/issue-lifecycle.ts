import { readFile, rename, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { mutateFrontmatter, parseFrontmatter, serializeFrontmatter } from "./frontmatter.ts";
import type { Frontmatter } from "./frontmatter.ts";
import { drainFailedTerminal } from "./queue.ts";
import { propagateBlocked } from "./blocked.ts";
import type { Logger } from "./log.ts";

export async function terminalDrain(
  cwd: string,
  log: Logger,
  todoPath: string,
  failedDir: string,
  cycleId: string,
  issueId: string,
  failingStep: string | undefined,
  failedAttempts: number,
): Promise<void> {
  let mutateErr: Error | null = null;
  try {
    await mutateFrontmatter(todoPath, (fm) => ({
      ...fm,
      failed_at: new Date().toISOString(),
      ...(failingStep ? { failed_step: failingStep } : {}),
      failed_attempts: failedAttempts,
      last_cycle_id: cycleId,
    }));
  } catch (e) {
    mutateErr = e as Error;
  }
  const failedPath = join(failedDir, `${issueId}.md`);
  if (mutateErr) {
    let originalBody = "";
    try {
      originalBody = await readFile(todoPath, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    let baseFm: Frontmatter = {};
    let bodyAfter = originalBody;
    try {
      const parsed = parseFrontmatter(originalBody);
      baseFm = { ...parsed.fm };
      bodyAfter = parsed.bodyAfter;
    } catch {
      // body had no frontmatter; emit stamps only, keep raw bytes as the body
    }
    const fm: Frontmatter = {
      ...baseFm,
      failed_at: new Date().toISOString(),
      ...(failingStep ? { failed_step: failingStep } : {}),
      failed_attempts: failedAttempts,
      last_cycle_id: cycleId,
      drain_error: mutateErr.message,
    };
    const out = serializeFrontmatter(fm, bodyAfter);
    const tmpPath = `${failedPath}.tmp`;
    await writeFile(tmpPath, out, "utf8");
    await rename(tmpPath, failedPath);
    try {
      await unlink(todoPath);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    await log.emit("queue.drain_warning", {
      cycle_id: cycleId,
      issue_id: issueId,
      reason: `mutateFrontmatter failed: ${mutateErr.message}`,
    });
  } else {
    try {
      await rename(todoPath, failedPath);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  await drainFailedTerminal(cwd, issueId);
  await propagateBlocked(cwd, issueId, log);
  await log.emit("queue.drained", { cycle_id: cycleId, issue_id: issueId, outcome: "terminal" });
  await log.emit("issue.failed", { issue_id: issueId, failing_step: failingStep });
}
