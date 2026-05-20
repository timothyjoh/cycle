const DENYLIST_PREFIXES = [".claude", "dist", "node_modules"];
const DENYLIST_EXACT = [".cycle/cycle.pid"];

export function isDenied(p: string): boolean {
  const q = p.replace(/\/$/, "");
  for (const prefix of DENYLIST_PREFIXES) {
    if (q === prefix || q.startsWith(prefix + "/")) return true;
  }
  if (DENYLIST_EXACT.includes(q)) return true;
  if (q.endsWith(".lock")) return true;
  return false;
}
