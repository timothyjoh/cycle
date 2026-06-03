// fixture: residue arm/persist clean layout
// Carries the single sanctioned bookkeeping mutation and three residue-guard
// gate calls so only the residue arm/persist invariant is under test; every
// arm here is correctly paired or whitelisted.
consecutiveFailures += 1;
if (await haltIfResidue()) { halted = true; }
if (await haltIfResidue()) { halted = true; }
if (await haltIfResidue()) { halted = true; }
// whitelisted tail-derived arm (failingStep: undefined), not persisted:
pendingResidueContext = { cycleId: tail.cycleId, issueId: tail.issueId, failingStep: undefined };
// paired arm -> persist (adjacent):
pendingResidueContext = { cycleId, issueId: row.id, failingStep };
await persistResidue(pendingResidueContext);
// paired arm -> persist separated by a comment (comment tolerance):
pendingResidueContext = { cycleId, issueId: row.id, failingStep: "commit" };
// intervening comment line
await persistResidue(pendingResidueContext);
// clear site must NOT be treated as an arm:
pendingResidueContext = undefined;
await unpersistResidue();
