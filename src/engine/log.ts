import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export type Logger = {
  emit: (event: string, fields: Record<string, unknown>) => Promise<void>;
};

export async function createLogger(repoRoot: string, sink: (line: string) => void = console.log): Promise<Logger> {
  const path = join(repoRoot, ".cycle", "log.jsonl");
  await mkdir(join(repoRoot, ".cycle"), { recursive: true });
  return {
    async emit(event, fields) {
      const line = JSON.stringify({ ts: new Date().toISOString(), event, ...fields });
      await appendFile(path, line + "\n", "utf8");
      sink(line);
    },
  };
}
