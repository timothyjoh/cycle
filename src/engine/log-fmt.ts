export function truncateHeadCapped(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
