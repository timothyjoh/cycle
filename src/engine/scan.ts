import { readdir, rename, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "./frontmatter.ts";
import {
  appendRow,
  bootstrapArchiveIfLegacy,
  readQueue,
  type QueueRow,
} from "./queue.ts";

export async function scanRaw(repoRoot: string): Promise<QueueRow[]> {
  const raw = join(repoRoot, "docs/cycle/issues/raw");
  const todo = join(repoRoot, "docs/cycle/issues/todo");
  const cycleDir = join(repoRoot, ".cycle");
  await mkdir(todo, { recursive: true });
  await mkdir(cycleDir, { recursive: true });

  await bootstrapArchiveIfLegacy(repoRoot);

  let files: string[] = [];
  try {
    files = (await readdir(raw)).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }

  const knownIds = new Set((await readQueue(repoRoot)).map((r) => r.id));
  const ingested: QueueRow[] = [];
  for (const f of files) {
    const src = join(raw, f);
    const dst = join(todo, f);
    const body = await readFile(src, "utf8");
    const { fm } = parseFrontmatter(body);
    await rename(src, dst);
    const id = String(fm.id);
    if (knownIds.has(id)) continue;
    const row: QueueRow = {
      id,
      title: String(fm.title ?? ""),
      status: "pending",
      attempt: 0,
      depends_on: [],
      triaged_at: String(fm.added_at ?? ""),
    };
    if (fm.parent !== undefined) row.parent = String(fm.parent);
    await appendRow(repoRoot, row);
    knownIds.add(id);
    ingested.push(row);
  }
  return ingested;
}
