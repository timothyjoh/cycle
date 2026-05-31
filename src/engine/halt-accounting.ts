import type { FastFailState } from "./iteration-guard.ts";

/** Supervisor halt context recorded on each terminal failure. */
export type HaltContext = { issueId: string; failingStep: string | undefined };

export type TerminalFailureResult = {
  consecutiveFailures: number;
  failedCycles: string[];
  lastHaltContext: HaltContext;
  fastFail: FastFailState;
  halt: boolean;
};

/**
 * Pure terminal-failure bookkeeping shared by the commit-failure, fast-bail,
 * and budget-exhausted supervisor branches in src/cli.ts. Increments the
 * consecutive-failure count, appends the cycle to failedCycles (returns a NEW
 * array — never mutates the input), records lastHaltContext, resets the
 * iteration-too-fast counter, and reports whether the max_consecutive_failures
 * threshold was reached.
 *
 * Side-effect-free: terminalDrain and the break/halt control flow stay at the
 * call site. The caller reassigns its loop state from the returned object and
 * acts on `halt`.
 */
export function recordTerminalFailure(
  prev: { consecutiveFailures: number; failedCycles: readonly string[] },
  opts: {
    cycleId: string;
    issueId: string;
    failingStep: string | undefined;
    maxConsecutiveFailures: number;
  },
): TerminalFailureResult {
  const consecutiveFailures = prev.consecutiveFailures + 1;
  const failedCycles = [...prev.failedCycles, opts.cycleId];
  return {
    consecutiveFailures,
    failedCycles,
    lastHaltContext: { issueId: opts.issueId, failingStep: opts.failingStep },
    fastFail: { key: null, count: 0 },
    halt: consecutiveFailures >= opts.maxConsecutiveFailures,
  };
}
