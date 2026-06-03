// fixture: current single-implementation layout (clean)
// resume block -- sole sanctioned inlined occurrence:
consecutiveFailures += 1;
failedCycles.push(tail.cycleId);
// delegating call sites use assignment, not the += mutation:
consecutiveFailures = acct.consecutiveFailures;
failedCycles = acct.failedCycles;
// residue guard wired at exactly three gated sites (cycle 0036; startup re-check 0039):
if (await haltIfResidue()) { halted = true; }
if (await haltIfResidue()) { halted = true; }
if (await haltIfResidue()) { halted = true; }
