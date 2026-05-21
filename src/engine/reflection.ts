import { mkdir, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { slugify } from "../issue/id.ts";
import { serializeFrontmatter } from "./frontmatter.ts";
import type { Logger } from "./log.ts";
import { stripFences } from "./log-fmt.ts";

export type SharpEdge = { title: string; body: string; priority_hint: number };
export type IngestResult = { written: string[]; skipped: number };

const FENCE_RE = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/;
const TRUNC_BUDGET = 8192;
const TRUNC_MARKER = "\n…\n";

export async function ingestReflection(
  repoRoot: string,
  cycleId: string,
  _cycleSlug: string,
  stdout: string,
  log: Logger,
): Promise<IngestResult> {
  const rawDir = join(repoRoot, "docs/cycle/issues/raw");

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

  let stripped = stdout.trim();
  const fence = stripped.match(FENCE_RE);
  if (fence) stripped = fence[1].trim();

  const parseRes = parseWithRepair(stripped);
  if (!parseRes.ok) {
    const path = await writeParseError(rawDir, cycleId, stdout);
    await log.emit("reflection.skipped", {
      cycle_id: cycleId,
      reason: "parse_error",
      message: parseRes.message,
    });
    await log.emit("reflection.summary", {
      cycle_id: cycleId,
      count: 0,
      skipped: 1,
    });
    return { written: [path], skipped: 1 };
  }
  const parsed: unknown = parseRes.value;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray((parsed as { sharp_edges?: unknown }).sharp_edges)) {
    await log.emit("reflection.skipped", {
      cycle_id: cycleId,
      reason: "parse_error",
      message: "missing sharp_edges array",
    });
    return { written: [], skipped: 0 };
  }

  const entries = (parsed as { sharp_edges: unknown[] }).sharp_edges;

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

type ParseResult = { ok: true; value: unknown } | { ok: false; message: string };

function parseWithRepair(s: string): ParseResult {
  s = stripFences(s);
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (e1) {
    const repaired = trimToLastBalancedClose(s);
    if (repaired === null) return { ok: false, message: (e1 as Error).message };
    try {
      return { ok: true, value: JSON.parse(repaired) };
    } catch (e2) {
      return { ok: false, message: (e2 as Error).message };
    }
  }
}

function trimToLastBalancedClose(s: string): string | null {
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x7b /* { */ || c === 0x5b /* [ */) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  let lastIdx = -1;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === "\\") {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) lastIdx = i;
    }
  }
  if (lastIdx < 0) return null;
  return s.slice(start, lastIdx + 1);
}

function truncateUtf8(s: string, budget: number = TRUNC_BUDGET, marker: string = TRUNC_MARKER): string {
  if (Buffer.byteLength(s, "utf8") <= budget) return s;
  const markerBytes = Buffer.byteLength(marker, "utf8");
  const cap = budget - markerBytes;
  let acc = 0;
  let cut = 0;
  for (const ch of s) {
    const n = Buffer.byteLength(ch, "utf8");
    if (acc + n > cap) break;
    acc += n;
    cut += ch.length;
  }
  return s.slice(0, cut) + marker;
}

async function writeParseError(rawDir: string, cycleId: string, stdout: string): Promise<string> {
  const id = `refl-${cycleId}-parse-error`;
  const body = truncateUtf8(stdout);
  const content = serializeFrontmatter(
    {
      id,
      source: "reflection",
      title: "reflection stdout failed to parse",
      added_at: new Date().toISOString(),
      triage_attempts: 0,
      priority_hint: 7,
      origin_cycle_id: cycleId,
    },
    "\n" + body + "\n",
  );
  await atomicWrite(join(rawDir, `${id}.md`), content);
  return id;
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
