The slug is `add-structural-invariant-pinning-every-r`. Writing to `docs/cycle/0043-feature-add-structural-invariant-pinning-every-r/SPEC.md`.

# SPEC — Cycle 0043: Machine-check that every residue-arming site in cli.ts is followed by a persist call

## WHY

Cycle 0042 added the fifth `persistResidue(pendingResidueContext)` call by hand so that every loop-back branch arming residue context in memory (`pendingResidueContext = { … }`) also mirrors it to `.cycle/failed-residue-context.json` for crash-safe re-check at engine start. But the arm→persist pairing is enforced only by prose in `CLAUDE.md` / `docs/ENGINE.md` ("five persist sites"). The sole residue-related entry in `scripts/structural-invariants.mjs` counts `haltIfResidue()` *check* sites (3), not *persist* sites.

A future cycle that introduces a new terminal-failure / loop-back branch, sets `pendingResidueContext = { … }`, and forgets the following `await persistResidue(...)` would silently reopen the crash-safety hole that cycles 0039 and 0042 spent two cycles closing — and nothing in the build gate would catch it. The crash-safety guarantee is currently doc-maintained, not machine-checked.

## CONCRETE USER BENEFIT

A maintainer who adds (or edits) a residue-arming branch in `src/cli.ts` without the paired persist call now gets a hard, named failure from `npm run check:invariants` (and therefore `npm test`) that points at the exact offending line and the arm/persist contract — instead of merging a silent regression that only surfaces as lost crash-safety in production after an engine restart on a dirty tree.

## USABLE END-STATE

Running `npm run check:invariants` on the current tree passes (all five persisted arming sites are paired; the one whitelisted tail-derived arming site is allowed). Deleting an `await persistResidue(...)` line that follows an arming assignment, or adding a new un-paired arming assignment, makes the check fail with a message naming the offending `src/cli.ts` line and the remediation. The whitelisted resume/startup arming site (around `src/cli.ts:650`, reconstructed from the in-flight log tail, `failingStep: undefined`) does not trip the check.

## Objective

This cycle extends the `INVARIANTS` machinery in `scripts/structural-invariants.mjs` so that the residue arm→persist correspondence in `src/cli.ts` is enforced at build time rather than by prose. The checker gains the ability to express a relational invariant (each arming assignment must be immediately followed by a persist call, modulo an explicit whitelist) alongside the existing count-based entries, and a new invariant entry uses it to pin every non-whitelisted `pendingResidueContext = { … }` assignment to a following `await persistResidue(...)`. No residue-guard runtime behavior changes — this is a build-time structural check only.

## Source Issue

`refl-0042-no-structural-invariant-pins-residue-per` — "Add structural invariant pinning every residue-arming site to a persistResidue call"

## Scope

### In Scope

- Extend `scripts/structural-invariants.mjs` to support a relational/predicate invariant (a `validate`-style entry that inspects matched lines and their successors) in addition to the existing count-based `{ pattern, expected }` entries, without breaking any current entry.
- Add one new `INVARIANTS` entry targeting `src/cli.ts` that asserts every arming assignment (`pendingResidueContext = { … }` assigned a non-`undefined` object literal) is immediately followed by `await persistResidue(...)`, **except** the explicitly whitelisted tail-derived resume/startup arming site(s) around `src/cli.ts:650`. The whitelist must be expressed structurally (e.g. matched by the `failingStep: undefined` tail-reconstruction shape), not as a brittle flat total count.
- A failure message that names the offending `src/cli.ts` arming line and points at the arm/persist contract so a future author knows exactly what to add.

### Out of Scope

- Any change to residue-guard runtime behavior in `src/cli.ts`, `src/engine/failed-residue-guard.ts`, or `src/engine/residue-context-store.ts` (assignments, persist/unpersist calls, halt logic all stay byte-for-byte).
- Adding an invariant for the `haltIfResidue()` check sites (already covered by the existing entry) or for `unpersistResidue()` clear sites.
- Generalizing the predicate-invariant facility beyond what this entry needs (no plugin system; the smallest extension that supports the new entry).

## Requirements

- The new invariant correctly passes against the current `src/cli.ts` (five persisted arming sites paired; the tail-derived site whitelisted).
- The whitelist is structural — derived from a recognizable property of the arming line (the `failingStep: undefined` log-tail reconstruction), not a hardcoded line number or a fixed total count.
- The checker continues to read every existing count-based entry and report `ok` / `FAIL` exactly as before; existing entries are unaffected.
- The relational check is resilient to formatting: it must match the arming assignment and locate the following `await persistResidue(...)` even with intervening comment lines, mirroring the current code shape (e.g. lines 670–671, 801–802, 858–859, 873–874, 886–887 in `src/cli.ts`).
- The new invariant entry carries a `reason` consistent with existing `INVARIANTS` conventions.
- **Failure behavior**: On an un-paired non-whitelisted arming site, the script must emit a `structural-invariants: FAIL src/cli.ts -- <reason>` line that names the offending arming line (line number and/or text) plus the arm/persist remediation, increment the failure count, and `process.exit(1)` — never pass silently. If `src/cli.ts` cannot be read, the existing read-error path (`exit 2`) is preserved. A malformed predicate-invariant entry (or an internal error while evaluating the predicate) must surface as a FAIL or a non-zero exit, never be coerced to a silent pass.

## Acceptance Criteria

- [ ] Running `npm run check:invariants` on the unmodified working tree exits 0 and prints an `ok` line for the new residue arm/persist invariant.
- [ ] **(User-observable benefit)** Temporarily deleting one `await persistResidue(pendingResidueContext);` line that follows an arming assignment in `src/cli.ts` makes `npm run check:invariants` exit non-zero with a `FAIL` line that names the offending arming line and references the arm/persist contract; restoring the line returns the check to passing.
- [ ] **(Failure-path)** Temporarily adding a new arming assignment `pendingResidueContext = { cycleId, issueId: row.id, failingStep };` with no following `await persistResidue(...)` makes the check FAIL and `process.exit(1)`, naming the new line; the whitelisted tail-derived site (`failingStep: undefined`, around `src/cli.ts:650`) does not trip the check.
- [ ] The existing `haltIfResidue()` count invariant and all other `INVARIANTS` entries still report their prior `ok`/`FAIL` results unchanged (verified by the check passing on the current tree with all entries listed).
- [ ] A unit/integration test exercises the new predicate invariant against both a paired fixture (passes) and an un-paired fixture (fails), so the check itself is covered, and meets the `scripts/structural-invariants.mjs`-adjacent coverage policy (`scripts/**` is in `test:coverage`).
- [ ] All existing tests still pass (`npm test`).
- [ ] No compiler/linter/typecheck warnings introduced (`npm run typecheck`).

## Testing Strategy

- **Framework**: existing `node:test` suite (run via `npm test` / `npm run test:coverage`); no new framework.
- **Happy path**: the predicate invariant passes against the real (or a fixture copy of the) `src/cli.ts` arm/persist layout, including intervening comment lines between arm and persist.
- **Failure paths**:
  - arming assignment with no following persist → FAIL, named line, non-zero exit;
  - persist call removed from a previously-paired site → FAIL;
  - the whitelisted tail-derived arming site (`failingStep: undefined`) present and un-persisted → still passes (whitelist honored).
- **Edge cases**: arm and persist separated by a comment line; multiple arming sites in one file; the read-error path (`exit 2`) preserved for an unreadable target.
- **Regression**: count-based entries continue to evaluate correctly; total pass/fail tally unchanged on the clean tree.
- No UI changes — no E2E tests required.

## Documentation Updates

- **CLAUDE.md**: update the residue-guard paragraph and the *Structural-invariants policy* note to state that the arm→persist correspondence is now machine-checked by an `INVARIANTS` entry (replace the "enforced only by prose / five persist sites" framing), and note the whitelisted tail-derived arming site.
- **docs/ENGINE.md** (*Failed-cycle dirty-worktree residue guard*): note that the persist-site pairing is enforced at build time via `scripts/structural-invariants.mjs`, and document the predicate-invariant facility if the section already enumerates the residue invariants.
- **README.md**: no user-facing runtime change; no update required (state this explicitly — the change is internal build-gate hardening).

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies

- `scripts/structural-invariants.mjs` and its `INVARIANTS` table (existing).
- `src/cli.ts` residue-arming / persist sites as wired by cycles 0038–0042 (existing; not modified this cycle).
- `npm run check:invariants` script and its `test:coverage` wiring (existing).
- No external services or env vars.
