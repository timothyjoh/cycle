import { readdir, rename, readFile, appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export type TbdEntry = { id: string; source: string; title: string; path: string; added_at: string };

function parseFrontmatter(body: string): Record<string, string> {
  const m = body.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error("no frontmatter");
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) out[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1");
  }
  return out;
}

export async function scanTbd(repoRoot: string): Promise<TbdEntry[]> {
  const tbd = join(repoRoot, "docs/cycle/issues/tbd");
  const queued = join(repoRoot, "docs/cycle/issues/queued");
  const cycleDir = join(repoRoot, ".cycle");
  await mkdir(queued, { recursive: true });
  await mkdir(cycleDir, { recursive: true });

  let files: string[] = [];
  try {
    files = (await readdir(tbd)).filter(f => f.endsWith(".md"));
  } catch {
    return [];
  }

  const ingested: TbdEntry[] = [];
  for (const f of files) {
    const src = join(tbd, f);
    const dst = join(queued, f);
    const body = await readFile(src, "utf8");
    const fm = parseFrontmatter(body);
    await rename(src, dst);
    const entry: TbdEntry = {
      id: fm.id,
      source: fm.source,
      title: fm.title,
      path: dst,
      added_at: fm.added_at,
    };
    await appendFile(join(cycleDir, "tbd.jsonl"), JSON.stringify(entry) + "\n", "utf8");
    ingested.push(entry);
  }
  return ingested;
}
