import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { freeformId } from "./id.ts";

export async function materializeFreeformIssue(
  text: string,
  repoRoot: string,
  now: Date = new Date(),
) {
  const id = freeformId(text, now);
  const dir = join(repoRoot, "docs", "cycle", "issues", "inbox");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${id}.md`);
  const frontmatter = [
    "---",
    `id: ${id}`,
    "source: text",
    `title: "${text.replace(/"/g, '\\"')}"`,
    `added_at: ${now.toISOString()}`,
    "triage_attempts: 0",
    "priority: medium",
    "---",
    "",
    text,
    "",
  ].join("\n");
  await writeFile(path, frontmatter, "utf8");
  return { path, id };
}
