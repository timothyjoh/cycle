// fixture: re-inlined terminal-failure bookkeeping (violation)
consecutiveFailures += 1;
failedCycles.push(tail.cycleId);
// a second, illegitimate re-inline at a delegating call site:
consecutiveFailures += 1;
failedCycles.push(r.cycleId);
