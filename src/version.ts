import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// __CYCLE_VERSION__ is substituted by esbuild at build time. When running
// from local source (e.g. tests), the define is absent and we fall back
// to reading package.json relative to this file.
declare const __CYCLE_VERSION__: string | undefined;

export async function getVersion(): Promise<string> {
  if (typeof __CYCLE_VERSION__ !== "undefined") return __CYCLE_VERSION__;
  const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  return pkg.version;
}
