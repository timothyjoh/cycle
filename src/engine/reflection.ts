import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { slugify } from "../issue/id.ts";
import { serializeFrontmatter } from "./frontmatter.ts";
import type { Logger } from "./log.ts";
import { stripFences } from "./log-fmt.ts";

export type SharpEdge = {
  title: string;
  body: string;
  bucket: "fix_now" | "defer" | "discuss";
  priority?: string;
};
export type IngestResult = { written: string[]; skipped: number; fixNow: number };

const TRUNC_BUDGET = 8192;
const TRUNC_MARKER = "\n…\n";
const VALID_BUCKETS = new Set(["fix_now", "defer", "discuss"]);
const VALID_PRIORITIES = new Set(["low", "medium", "high", "critical"]);
const DEFERRED_CAP = 2;

export async function ingestReflection(
  repoRoot: string,
  cycleId: string,
  _cycleSlug: string,
  stdout: string,
  log: Logger,
  artifactDir: string,
  touchedJsonPath: string,
): Promise<IngestResult> {
  const rawDir = join(repoRoot, "docs/cycle/issues/raw");
  const todoDir = join(repoRoot, "docs/cycle/issues/todo");
  const discussDir = join(repoRoot, "docs/cycle/issues/discuss");

  // Idempotent cleanup: remove prior refl-<cycleId>-*.md from raw/
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

  const parseRes = parseWithRepair(stdout.trim());
  if (!parseRes.ok) {
    const id = await writeParseError(rawDir, cycleId, stdout);
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
    return { written: [id], skipped: 1, fixNow: 0 };
  }
  const parsed: unknown = parseRes.value;

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    !Array.isArray((parsed as { sharp_edges?: unknown }).sharp_edges)
  ) {
    await log.emit("reflection.skipped", {
      cycle_id: cycleId,
      reason: "parse_error",
      message: "missing sharp_edges array",
    });
    return { written: [], skipped: 0, fixNow: 0 };
  }

  const entries = (parsed as { sharp_edges: unknown[] }).sharp_edges;

  // Read touched.json footprint
  let touchedFiles: string[] = [];
  try {
    const tj = JSON.parse(await readFile(touchedJsonPath, "utf8")) as { files?: unknown };
    if (Array.isArray(tj.files)) touchedFiles = tj.files as string[];
  } catch { /* absent — ok */ }

  // Collect scope warning synthetic entries from log.jsonl
  const logPath = join(repoRoot, ".cycle", "log.jsonl");
  const scopeWarnings = await readScopeWarnings(logPath, cycleId);
  const syntheticEntries: SharpEdge[] = scopeWarnings.map((files) => ({
    title: `scope-warning cleanup: ${files.slice(0, 3).join(", ")}${files.length > 3 ? " …" : ""}`,
    body: `Files committed outside the cycle footprint: ${files.join(", ")}. These files were not tracked in touched.json. Investigate whether touched.json accumulation needs updating or whether the commit included unintended changes.`,
    bucket: "defer" as const,
    priority: "low",
  }));

  // Build dedup map AFTER cleanup so raw/ is fresh
  const dedupeMap = await buildDedupeMap(rawDir, todoDir, discussDir);

  const written: string[] = [];
  let skipped = 0;
  let fixNow = 0;
  let deferredCount = 0;
  let capDropped = 0;
  let dedupSkipped = 0;
  let validationSkipped = 0;
  const usedSlugs = new Set<string>();
  const nowIso = new Date().toISOString();
  const fixNowItems: SharpEdge[] = [];
  const allEntries = [...entries, ...syntheticEntries];

  for (let i = 0; i < allEntries.length; i++) {
    const raw = allEntries[i] as Partial<SharpEdge> | null | undefined;
    const invalid = validateEntry(raw);
    if (invalid) {
      await log.emit("reflection.skipped", {
        cycle_id: cycleId,
        reason: "invalid_entry",
        entry_index: i,
        field: invalid,
      });
      skipped++;
      validationSkipped++;
      continue;
    }
    const e = raw as SharpEdge;

    if (e.bucket === "fix_now") {
      fixNowItems.push(e);
      fixNow++;
      await log.emit("reflection.fix_now_written", {
        cycle_id: cycleId,
        title: e.title,
        index: fixNowItems.length - 1,
      });
      continue;
    }

    // defer or discuss — compute slug/id
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

    // Dedup check
    const existingIn = dedupeMap.get(id);
    if (existingIn !== undefined) {
      await log.emit("reflection.dedup_skipped", {
        cycle_id: cycleId,
        id,
        existing_in: existingIn,
      });
      dedupSkipped++;
      continue;
    }

    // Cap check
    if (deferredCount >= DEFERRED_CAP) {
      capDropped++;
      await log.emit("reflection.cap_reached", {
        cycle_id: cycleId,
        title: e.title,
        bucket: e.bucket,
        dropped_count: capDropped,
      });
      continue;
    }

    // Write raw issue
    const priority = e.bucket === "discuss" ? "discuss" : (e.priority ?? "medium");
    const content = serializeFrontmatter(
      {
        id,
        source: "reflection",
        title: e.title,
        added_at: nowIso,
        triage_attempts: 0,
        priority,
        origin_cycle_id: cycleId,
      },
      "\n" + e.body + "\n",
    );
    await atomicWrite(join(rawDir, `${id}.md`), content);
    written.push(id);
    deferredCount++;
    await log.emit("reflection.deferred_issue_written", {
      cycle_id: cycleId,
      raw_id: id,
      title: e.title,
      bucket: e.bucket,
      priority,
    });
  }

  // Write FINAL_FIXES.md only when fix_now items exist
  if (fixNowItems.length > 0) {
    const content = buildFinalFixesContent(cycleId, fixNowItems, touchedFiles);
    await atomicWrite(join(artifactDir, "FINAL_FIXES.md"), content);
  }

  // Write REFLECTION.md on every successful reflection
  const reflContent = buildReflectionContent(cycleId, allEntries.length, {
    fixNow,
    deferred: deferredCount,
    dedupSkipped,
    capDropped,
    validationSkipped,
  });
  await atomicWrite(join(artifactDir, "REFLECTION.md"), reflContent);

  await log.emit("reflection.summary", {
    cycle_id: cycleId,
    count: written.length,
    skipped,
    fix_now: fixNow,
    cap_dropped: capDropped,
    dedup_skipped: dedupSkipped,
  });

  return { written, skipped, fixNow };
}

async function readScopeWarnings(logPath: string, cycleId: string): Promise<string[][]> {
  try {
    const text = await readFile(logPath, "utf8");
    const results: string[][] = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line) as { event?: string; cycle_id?: string; files?: unknown };
        if (
          ev.event === "commit.scope_warning" &&
          ev.cycle_id === cycleId &&
          Array.isArray(ev.files)
        ) {
          results.push(ev.files as string[]);
        }
      } catch { /* skip malformed lines */ }
    }
    return results;
  } catch { return []; }
}

async function buildDedupeMap(
  rawDir: string,
  todoDir: string,
  discussDir: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const [dir, label] of [
    [rawDir, "raw"],
    [todoDir, "todo"],
    [discussDir, "discuss"],
  ] as [string, string][]) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isFile() && ent.name.endsWith(".md")) {
          map.set(ent.name.slice(0, -3), label);
        }
      }
    } catch { /* dir absent — ok */ }
  }
  return map;
}

function buildFinalFixesContent(cycleId: string, fixes: SharpEdge[], touchedFiles: string[]): string {
  const header =
    touchedFiles.length > 0
      ? `> Footprint: ${touchedFiles.join(", ")}`
      : `> Footprint: unknown — touched.json absent`;
  const items = fixes
    .map((f, i) => `## Fix ${i + 1}: ${f.title}\n\n${f.body}`)
    .join("\n\n---\n\n");
  return `# Final Fixes — Cycle ${cycleId}\n\n${header}\n\n${items}\n`;
}

function buildReflectionContent(
  cycleId: string,
  edgeCount: number,
  routing: {
    fixNow: number;
    deferred: number;
    dedupSkipped: number;
    capDropped: number;
    validationSkipped: number;
  },
): string {
  return [
    `# Reflection — Cycle ${cycleId}`,
    "",
    `Sharp edges surfaced: ${edgeCount}`,
    "",
    "## Routing Summary",
    "",
    "| Category | Count |",
    "|---|---|",
    `| fix_now | ${routing.fixNow} |`,
    `| deferred to raw/ | ${routing.deferred} |`,
    `| dedup skipped | ${routing.dedupSkipped} |`,
    `| cap dropped | ${routing.capDropped} |`,
    `| validation skipped | ${routing.validationSkipped} |`,
    "",
  ].join("\n");
}

type ParseResult = { ok: true; value: unknown } | { ok: false; message: string };

function parseWithRepair(s: string): ParseResult {
  s = stripFences(s);
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (e1) {
    let offset = 0;
    while (true) {
      const repaired = trimToLastBalancedClose(s, offset);
      if (repaired === null) return { ok: false, message: (e1 as Error).message };
      try {
        return { ok: true, value: JSON.parse(repaired.slice) };
      } catch {
        offset = repaired.start + 1;
      }
    }
  }
}

function trimToLastBalancedClose(s: string, startOffset: number = 0): { slice: string; start: number } | null {
  let start = -1;
  for (let i = startOffset; i < s.length; i++) {
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
  return { slice: s.slice(start, lastIdx + 1), start };
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
      priority: "high",
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
  if (typeof e.bucket !== "string" || !VALID_BUCKETS.has(e.bucket)) return "bucket";
  if (e.bucket === "defer") {
    if (typeof e.priority !== "string" || !VALID_PRIORITIES.has(e.priority)) return "priority";
  }
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
