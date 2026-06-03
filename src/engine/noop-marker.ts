import { readFile } from "node:fs/promises";

// Recognized no-op reason categories. A NOOP.md marker whose `reason:` line
// names anything outside this set is treated as malformed (invalid) and falls
// through to the existing empty-diff failure (anti-slop).
export const NOOP_REASONS = new Set([
  "already-satisfied",
  "duplicate",
  "not-actionable",
]);

export type NoopClassification =
  | { valid: true; reason: string }
  | { valid: false };

// A `<path>.<ext>:<line>` evidence token (e.g. src/engine/run-cycle.ts:653).
// Requires a dotted filename followed by `:digits` so the bare `reason:` line
// (no `.ext:digits`) never counts as evidence and unrelated prose cannot smuggle
// a fabricated "done".
const EVIDENCE_RE = /[\w./-]+\.\w+:\d+\b/;
const REASON_RE = /^\s*reason\s*:\s*([a-z-]+)\s*$/i;

// Pure: classify NOOP.md content. Valid only when a recognized reason category
// AND at least one file:line evidence line are both present. Never throws.
export function parseNoopMarker(content: string): NoopClassification {
  let reason: string | undefined;
  let evidenceCount = 0;
  for (const line of content.split("\n")) {
    const m = REASON_RE.exec(line);
    if (m && reason === undefined) {
      const r = m[1].toLowerCase();
      if (NOOP_REASONS.has(r)) reason = r;
    }
    if (EVIDENCE_RE.test(line)) evidenceCount++;
  }
  if (reason !== undefined && evidenceCount >= 1) return { valid: true, reason };
  return { valid: false };
}

// Fail-closed reader: an absent/unreadable marker is not a no-op (returns
// `{ valid: false }`, never throws), so the existing empty-diff failure is
// preserved. Mirrors the posture of classifyArtifact in run-cycle.ts.
export async function classifyNoopMarker(markerPath: string): Promise<NoopClassification> {
  let content: string;
  try {
    content = await readFile(markerPath, "utf8");
  } catch {
    return { valid: false };
  }
  return parseNoopMarker(content);
}
