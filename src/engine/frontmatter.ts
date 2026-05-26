import { readFile, writeFile, rename } from "node:fs/promises";
import YAML from "yaml";

export type FrontmatterValue = string | number | string[];
export type Frontmatter = Record<string, FrontmatterValue>;

export type ParsedFrontmatter = { fm: Frontmatter; bodyAfter: string };

const FM_RE = /^---\n([\s\S]*?)\n---\n/;

export function parseFrontmatter(body: string): ParsedFrontmatter {
  const m = body.match(FM_RE);
  if (!m) throw new Error("no frontmatter");
  const fm = (YAML.parse(m[1]) as Frontmatter) ?? {};
  const bodyAfter = body.slice(m[0].length);
  return { fm, bodyAfter };
}

export function serializeFrontmatter(fm: Frontmatter, bodyAfter: string): string {
  return "---\n" + YAML.stringify(fm) + "---\n" + bodyAfter;
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
