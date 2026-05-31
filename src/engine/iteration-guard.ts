import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Read the last failed `cycle.end` for `cycleId` (for `failing_step`) and, in
 * the same bottom-up pass, the matching `step.end`'s `duration_ms`.
 *
 * Degrade-to-safe semantics for the iteration-too-fast guard:
 * - a missing/unreadable log returns `{ failingStep: undefined, durationMs: undefined }`;
 * - a missing or non-numeric `duration_ms` yields `durationMs: undefined`, so the
 *   guard treats the attempt as *not* sub-threshold (normal count-based retry,
 *   never a spurious fast-bail).
 */
export async function readCycleEndFailure(
  repoRoot: string,
  cycleId: string,
): Promise<{ failingStep: string | undefined; durationMs: number | undefined }> {
  try {
    const text = await readFile(join(repoRoot, ".cycle", "log.jsonl"), "utf8");
    const lines = text.split("\n");
    let failingStep: string | undefined;
    let sawCycleEnd = false;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      let ev: Record<string, unknown>;
      try {
        ev = JSON.parse(line) as Record<string, unknown>;
      } catch { continue; /* skip malformed */ }
      if (
        !sawCycleEnd &&
        ev.event === "cycle.end" &&
        ev.cycle_id === cycleId &&
        ev.status === "failed"
      ) {
        failingStep = typeof ev.failing_step === "string" ? ev.failing_step : undefined;
        sawCycleEnd = true;
        if (failingStep === undefined) break;
        continue;
      }
      if (
        sawCycleEnd &&
        ev.event === "step.end" &&
        ev.cycle_id === cycleId &&
        ev.step === failingStep
      ) {
        const d = ev.duration_ms;
        const durationMs = typeof d === "number" && Number.isFinite(d) ? d : undefined;
        return { failingStep, durationMs };
      }
    }
    return { failingStep, durationMs: undefined };
  } catch {
    return { failingStep: undefined, durationMs: undefined };
  }
}

/** In-memory counter for consecutive same-step sub-threshold failures. */
export type FastFailState = { key: string | null; count: number };

/**
 * Pure transition for the iteration-too-fast counter. Given the prior counter
 * state and the outcome of one exec failure, return the next state and whether
 * to fast-bail.
 *
 * - A sub-threshold failure of the same `(cycleId, step)` key increments the count;
 *   a *different* key starts fresh at 1.
 * - Any non-sub-threshold failure (guard disabled, no failing step, unreadable /
 *   `≥`-threshold duration) resets the counter to `{ key: null, count: 0 }` so it
 *   degrades to normal count-based retry.
 * - `fastBail` is true once the (same-key) count reaches `k`.
 */
export function advanceFastFailCounter(
  prev: FastFailState,
  opts: {
    key: string;
    guardEnabled: boolean;
    failingStep: string | undefined;
    durationMs: number | undefined;
    thresholdMs: number;
    k: number;
  },
): { state: FastFailState; fastBail: boolean } {
  const subThreshold =
    opts.guardEnabled &&
    opts.failingStep !== undefined &&
    typeof opts.durationMs === "number" &&
    opts.durationMs < opts.thresholdMs;
  if (!subThreshold) {
    return { state: { key: null, count: 0 }, fastBail: false };
  }
  const count = opts.key === prev.key ? prev.count + 1 : 1;
  return { state: { key: opts.key, count }, fastBail: count >= opts.k };
}
