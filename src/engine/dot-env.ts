import { readFileSync } from "node:fs";

/** Reads a file as UTF-8 text. Injectable seam for fault tests; defaults to the real fs read. */
export type ReadFileFn = (filePath: string) => string;

const defaultReadFile: ReadFileFn = (filePath) => readFileSync(filePath, "utf8");

export function loadDotEnv(
  filePath: string,
  readFile: ReadFileFn = defaultReadFile
): void {
  let content: string;
  try {
    content = readFile(filePath);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== "ENOENT") {
      throw Object.assign(
        new Error(`Cannot read .env file at ${filePath}: ${err.message}`),
        { code: err.code }
      );
    }
    return;
  }
  for (const line of content.split("\n")) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
