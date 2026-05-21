export function truncateHeadCapped(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function stripFences(s: string): string {
  const m = s.trim().match(/^```(?:json)?\r?\n([\s\S]*?)\r?\n```$/);
  return m ? m[1] : s;
}
