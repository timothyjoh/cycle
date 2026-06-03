// fixture: residue arm with no following persist (violation)
// Same baseline (single bookkeeping mutation, three residue-guard gate calls)
// so only the residue arm/persist invariant fails; the whitelisted site is
// present and un-persisted yet must still pass — the failure is the genuine
// non-whitelisted un-paired arm below.
consecutiveFailures += 1;
if (await haltIfResidue()) { halted = true; }
if (await haltIfResidue()) { halted = true; }
if (await haltIfResidue()) { halted = true; }
// whitelisted site present and un-persisted -> must still pass:
pendingResidueContext = { cycleId: tail.cycleId, issueId: tail.issueId, failingStep: undefined };
// non-whitelisted arm with NO following persist -> the violation:
pendingResidueContext = { cycleId, issueId: row.id, failingStep };
if (acct.halt) { halted = true; }
