// fixture: current single-implementation layout (clean)
// resume block -- sole sanctioned inlined occurrence:
consecutiveFailures += 1;
failedCycles.push(tail.cycleId);
// delegating call sites use assignment, not the += mutation:
consecutiveFailures = acct.consecutiveFailures;
failedCycles = acct.failedCycles;
// residue guard wired at exactly two gated sites (cycle 0036):
if (await haltIfResidue()) { halted = true; }
if (await haltIfResidue()) { halted = true; }
