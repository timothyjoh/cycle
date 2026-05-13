import { mkdir, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { slugify } from "../issue/id.ts";
import { serializeFrontmatter } from "./frontmatter.ts";
import type { Logger } from "./log.ts";

export type SharpEdge = { title: string; body: string; priority_hint: number };
export type IngestResult = { written: string[]; skipped: number };

const FENCE_RE = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/;

export async function ingestReflection(
  repoRoot: string,
  cycleId: string,
  _cycleSlug: string,
  stdout: string,
  log: Logger,
): Promise<IngestResult> {
  const rawDir = join(repoRoot, "docs/cycle/issues/raw");

  let stripped = stdout.trim();
  const fence = stripped.match(FENCE_RE);
  if (fence) stripped = fence[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    await log.emit("reflection.skipped", {
      cycle_id: cycleId,
      reason: "parse_error",
      message: (err as Error).message,
    });
    return { written: [], skipped: 0 };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray((parsed as { sharp_edges?: unknown }).sharp_edges)) {
    await log.emit("reflection.skipped", {
      cycle_id: cycleId,
      reason: "parse_error",
      message: "missing sharp_edges array",
    });
    return { written: [], skipped: 0 };
  }

  const entries = (parsed as { sharp_edges: unknown[] }).sharp_edges;

  await mkdir(rawDir, { recursive: true });
  const existing = await readdir(rawDir);
  const re = new RegExp(`^refl-${cycleId}-.+\\.md$`);
  for (const name of existing) {
    if (re.test(name)) {
      try {
        await unlink(join(rawDir, name));
      } catch {
        // best-effort
      }
    }
  }

  const written: string[] = [];
  let skipped = 0;
  const usedSlugs = new Set<string>();
  const nowIso = new Date().toISOString();

  for (let i = 0; i < entries.length; i++) {
    const raw = entries[i] as Partial<SharpEdge> | null | undefined;
    const invalid = validateEntry(raw);
    if (invalid) {
      await log.emit("reflection.skipped", {
        cycle_id: cycleId,
        reason: "invalid_entry",
        entry_index: i,
        field: invalid,
      });
      skipped++;
      continue;
    }
    const e = raw as SharpEdge;
    let slug = slugify(e.title);
    if (slug === "") slug = "entry";
    let unique = slug;
    let n = 2;
    while (usedSlugs.has(unique)) {
      unique = `${slug}-${n}`;
      n++;
    }
    usedSlugs.add(unique);

    const id = `refl-${cycleId}-${unique}`;
    const content = serializeFrontmatter(
      {
        id,
        source: "reflection",
        title: e.title,
        added_at: nowIso,
        triage_attempts: 0,
        priority_hint: e.priority_hint,
        origin_cycle_id: cycleId,
      },
      "\n" + e.body + "\n",
    );
    await atomicWrite(join(rawDir, `${id}.md`), content);
    written.push(id);
    await log.emit("reflection.surfaced", {
      cycle_id: cycleId,
      raw_id: id,
      title: e.title,
      priority_hint: e.priority_hint,
    });
  }

  await log.emit("reflection.summary", {
    cycle_id: cycleId,
    count: written.length,
    skipped,
  });

  return { written, skipped };
}

function validateEntry(e: Partial<SharpEdge> | null | undefined): string | null {
  if (!e || typeof e !== "object") return "entry";
  if (typeof e.title !== "string" || e.title.trim() === "") return "title";
  if (typeof e.body !== "string" || e.body.trim() === "") return "body";
  if (typeof e.priority_hint !== "number" || !Number.isFinite(e.priority_hint)) return "priority_hint";
  return null;
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = path + ".tmp";
  await writeFile(tmp, content, "utf8");
  try {
    await rename(tmp, path);
  } catch (e) {
    try {
      await unlink(tmp);
    } catch {
      // best-effort cleanup
    }
    throw e;
  }
}
