import { readFile } from "node:fs/promises";
import type { CycleConfig } from "./workflow.ts";

/** Discriminated verdict for the walkthrough degradation gate (cycle 0274).
 * The single `reason` channel covers both the hook-supplied degradation flag
 * (`degraded_flag[: <hook reason>]`) and a present-but-corrupt sidecar
 * (`unparseable: <detail>`), distinguished by prefix. */
export type WalkthroughDegradation =
  | { degraded: true; reason: string }
  | { degraded: false };

/** Defensive `=== true` coercion of engine.walkthrough_required. Absent /
 *  non-boolean / malformed / missing engine ⇒ false. Never throws. */
export function resolveWalkthroughRequired(cfg: CycleConfig): boolean {
  return cfg?.engine?.walkthrough_required === true;
}

/** UI-scope opt-out predicate. Mirrors resolveExpectsCode: returns false ONLY
 *  for an explicit boolean `expects_ui: false`; absent / non-boolean / true
 *  ⇒ true (fail-closed UI-shipping). Never throws. */
export function resolveExpectsUi(fm: Record<string, unknown>): boolean {
  return fm?.expects_ui === false ? false : true;
}

/** Pure classifier over the sidecar's text. Present-but-corrupt ⇒ degraded
 *  (`unparseable`), because a corrupt proof-of-work signal cannot be coerced
 *  to "the app works". A parsed object with `degraded === true` ⇒ degraded
 *  (folding in the hook-supplied reason); otherwise not degraded. Never throws. */
export function classifyWalkthroughDegradation(text: string): WalkthroughDegradation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { degraded: true, reason: `unparseable: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { degraded: true, reason: "unparseable: sidecar is not a JSON object" };
  }
  const rec = parsed as Record<string, unknown>;
  if (rec.degraded === true) {
    const hookReason = typeof rec.reason === "string" && rec.reason.trim() ? rec.reason.trim() : undefined;
    return { degraded: true, reason: hookReason ? `degraded_flag: ${hookReason}` : "degraded_flag" };
  }
  return { degraded: false };
}

/** Fail-closed reader. Absent sidecar (ENOENT) ⇒ not degraded (the hook ran
 *  and did not flag). Present-but-unreadable ⇒ degraded (cannot coerce a
 *  corrupt/unreadable proof to "works"). Otherwise delegate to the pure
 *  classifier. Never throws. */
export async function readWalkthroughDegradation(sidecarPath: string): Promise<WalkthroughDegradation> {
  let text: string;
  try {
    text = await readFile(sidecarPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return { degraded: false };
    return { degraded: true, reason: `unparseable: ${err instanceof Error ? err.message : String(err)}` };
  }
  return classifyWalkthroughDegradation(text);
}
