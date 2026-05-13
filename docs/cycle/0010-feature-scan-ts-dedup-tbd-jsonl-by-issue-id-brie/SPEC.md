# SPEC — Cycle 0010: scan.ts dedup tbd.jsonl by issue id

## Objective
Prevent duplicate entries in `.cycle/tbd.jsonl` when an issue file is re-queued. BRIEF's contract says the live queue dedups by id, but `src/engine/scan.ts` unconditionally appends, so re-running the engine on a re-staged issue (or any path that puts an existing id back into `tbd/`) corrupts the queue with duplicate rows. Fix is small and local to `scanTbd`.

## Source Issue
`txt-20260513-014816-scan-ts-dedup-tbd-jsonl-by-issue-id-brie` — "scan.ts: dedup tbd.jsonl by issue id"

## Scope

### In Scope
- Read existing `.cycle/tbd.jsonl` at the start of `scanTbd`, build a Set of known ids.
- Skip the `appendFile` for any entry whose `id` is already present (the `tbd/ → queued/` rename still happens — the file already moved is still a no-op rename if it was already moved; on a fresh re-stage the file moves but no duplicate jsonl row is written).
- Test covering: re-queue a `tbd/` file twice (drop file → scan → drop same id again → scan) and assert exactly one row in `tbd.jsonl` for that id.

### Out of Scope
- Reordering / priority logic in `tbd.jsonl` (RFC-001 priority queue work).
- Drain-on-completion mutation of `tbd.jsonl` (separate concern, lives in run-cycle).
- Migrating any historical duplicate rows (no migration; new behavior applies going forward).
- Touching `triage.attempts` / `status` schema fields — this cycle only protects the append path.

## Requirements
- `scanTbd` reads existing `.cycle/tbd.jsonl` (if present) and parses each line's `id` into a Set before iterating `tbd/` files.
- For each ingested file, append to `tbd.jsonl` **only if** the id is not in the Set; otherwise skip the append but still perform the `tbd/ → queued/` rename (BRIEF: "move first to queued/, then append to tbd.jsonl (dedup by id)").
- Skipped entries are still included in the returned `TbdEntry[]` so callers see what was ingested this scan (or — alternative — exclude them; pick whichever matches existing call-site expectations and document the choice in PLAN).
- Malformed lines in existing `tbd.jsonl` (blank, non-JSON, missing `id`) must not crash the scan — tolerate and skip them.
- No change to public type `TbdEntry` or function signature.

## Acceptance Criteria
- [ ] Re-queueing the same issue id twice (drop file in `tbd/`, scan, drop file in `tbd/` again, scan) results in exactly one matching row in `.cycle/tbd.jsonl`.
- [ ] Scanning with no pre-existing `tbd.jsonl` works (cold start) — current cold-start behavior preserved.
- [ ] Scanning with a malformed `tbd.jsonl` line does not throw; valid ids still parsed.
- [ ] Existing `scanTbd` tests still pass.
- [ ] `npm test` green; coverage non-regressing (line ≥ 95%, branch ≥ 75%, func ≥ 90%).
- [ ] `npm run typecheck` clean.
- [ ] No new lint warnings.

## Testing Strategy
- Node's native test runner (already used in `tests/`).
- New unit test in `tests/engine/scan.test.ts` (or wherever existing `scanTbd` tests live):
  - **Happy path no dup:** scan with empty `tbd.jsonl` → row appended.
  - **Dup id skip:** seed `tbd.jsonl` with id `X`, drop a `tbd/X.md`, scan → file moves to `queued/`, `tbd.jsonl` still has exactly one row for `X`.
  - **Two-scan dup:** drop `tbd/X.md`, scan, drop a second copy with same id into `tbd/`, scan → `tbd.jsonl` has exactly one row for `X`.
  - **Malformed line tolerated:** seed `tbd.jsonl` with a junk line + a valid line, scan a new id → does not throw, new id row appended.
- Use `tmpdir()` fixtures (consistent with existing engine tests).

## Documentation Updates
- **CLAUDE.md**: no change (subprocess/runtime sections unaffected).
- **BRIEF.md**: no change — the contract already says "dedup by id"; we're aligning code to the spec.
- **README.md**: no change.
- Note the dedup behavior with a one-line comment at the top of `scanTbd` only if it isn't self-evident from the code (default: no comment).

## Dependencies
- None new. Uses existing `node:fs/promises` imports.
- Runs under Node ≥ 22.6 (already required).
