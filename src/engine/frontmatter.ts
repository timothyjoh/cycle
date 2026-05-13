import { readFile, writeFile, rename } from "node:fs/promises";

export type FrontmatterValue = string | number | string[];
export type Frontmatter = Record<string, FrontmatterValue>;

export type ParsedFrontmatter = { fm: Frontmatter; bodyAfter: string };

const FM_RE = /^---\n([\s\S]*?)\n---\n/;

function parseScalar(raw: string): FrontmatterValue {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((p) => p.trim().replace(/^"(.*)"$/s, "$1"));
  }
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed.replace(/^"((?:[^"\\]|\\.)*)"$/s, (_, inner: string) => inner.replace(/\\"/g, '"'));
}

export function parseFrontmatter(body: string): ParsedFrontmatter {
  const m = body.match(FM_RE);
  if (!m) throw new Error("no frontmatter");
  const fm: Frontmatter = {};
  for (const line of m[1].split("\n")) {
    if (!line.trim()) continue;
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) fm[kv[1]] = parseScalar(kv[2]);
  }
  const bodyAfter = body.slice(m[0].length);
  return { fm, bodyAfter };
}

function needsQuote(s: string): boolean {
  if (s === "") return true;
  if (/^[\s]/.test(s) || /[\s]$/.test(s)) return true;
  if (/[:"#\n]/.test(s)) return true;
  if (/^-?\d+$/.test(s)) return true;
  return false;
}

function serializeValue(v: FrontmatterValue): string {
  if (Array.isArray(v)) {
    return "[" + v.map((s) => (needsQuote(s) ? `"${s.replace(/"/g, '\\"')}"` : s)).join(", ") + "]";
  }
  if (typeof v === "number") return String(v);
  if (needsQuote(v)) return `"${v.replace(/"/g, '\\"')}"`;
  return v;
}

export function serializeFrontmatter(fm: Frontmatter, bodyAfter: string): string {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    lines.push(`${k}: ${serializeValue(v)}`);
  }
  lines.push("---");
  return lines.join("\n") + "\n" + bodyAfter;
}

export async function mutateFrontmatter(
  path: string,
  patch: (fm: Frontmatter) => Frontmatter,
): Promise<void> {
  const body = await readFile(path, "utf8");
  const { fm, bodyAfter } = parseFrontmatter(body);
  const next = patch({ ...fm });
  const out = serializeFrontmatter(next, bodyAfter);
  const tmp = path + ".tmp";
  await writeFile(tmp, out, "utf8");
  await rename(tmp, path);
}
