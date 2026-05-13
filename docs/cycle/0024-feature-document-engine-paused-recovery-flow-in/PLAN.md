```markdown
# Implementation Plan: Cycle 0024

## Overview
Docs-only cycle. Add a `## Recovering from engine.paused` H2 to `README.md`, extend the `Triage subroutine` bullet in `CLAUDE.md` with the enriched-payload field names plus the `cycle triage --dry-run` iteration handle, and add a forward cross-link from `docs/RFC-001-issue-lifecycle.md` §5 to the new README section.

## Current State (from Research)
- `README.md` is 10 lines total — one `## Cycle behavior` H2 covering `commit.sh`/`pr.sh`. No triage, engine.paused, or recovery content yet. No canonical CLI invocation example exists in README to mirror; we'll adopt the `cycle <subcmd>` form already used in `CLAUDE.md`'s Commands table.
- `CLAUDE.md:40` already names `engine.paused { reason: "all_triage_failed", raw_ids: string[], last_errors: Array<{raw_id, error}> }` verbatim. Trailing sentence `` `--dry-run` skips triage `` refers to the engine's `--dry-run`, NOT the new `cycle triage --dry-run` diagnostic — must not be conflated.
- `CLAUDE.md:20` Commands table already documents `cycle triage --dry-run` end-to-end (semantics, exit codes, side-effect guarantees). README phrasing will mirror this row.
- `docs/RFC-001-issue-lifecycle.md` §5 closes at L225 with: "If ALL raws fail triage in one pass (suggests broken prompt or API outage): emit `engine.paused` and exit." This is the cross-link anchor point.
- `src/engine/triage.ts:237–245` is the payload source of truth — README quotes field names verbatim.
- `CHANGELOG.md` does NOT exist. Since README + CLAUDE.md + RFC edits guarantee a non-empty diff, CHANGELOG path is dead code and will not be created.

## Desired End State
- `README.md` ends with a new `## Recovering from engine.paused` H2 (slug `recovering-from-enginepaused`) that an operator can execute from cold — payload description, inspection commands, dry-run iteration loop, delete-vs-edit guidance, safety guarantee.
- `CLAUDE.md:40` `Triage subroutine` bullet still references the three payload fields (already present) AND now names `cycle triage --dry-run` as the operator iteration handle, with no conflation against the engine's `--dry-run`.
- `docs/RFC-001-issue-lifecycle.md` §5 closing paragraph (L224–226) contains a relative link to `../README.md#recovering-from-enginepaused`.
- `npm test` + `npm run typecheck` both pass. Coverage unchanged (docs-only diff).

Verify: grep `reason`, `raw_ids`, `last_errors` in README.md and CLAUDE.md; render the RFC link locally; re-read README section end-to-end as if from a paused-engine alert.

## What We're NOT Doing
- No code changes in `src/`, `tests/`, or `.cycle/`.
- No `cycle status` integration for paused state (SPEC §Out of Scope; deferred to a future cycle).
- No edit to RFC-001 §13 "engine.paused recovery" open-question bullet (SPEC: "no unrelated rewrites"). The §5 cross-link is sufficient; flipping §13 to "Status: landed (cycle 0024)" is a separate cleanup.
- No CHANGELOG.md creation — non-empty diff is guaranteed by the three doc edits, so the SPEC fallback is dead code.
- No reordering or rewriting of existing README/CLAUDE.md/RFC content beyond the additive edits listed in tasks below.
- No new tests. SPEC explicitly says editorial verification only.

## Implementation Approach
Three additive doc edits, smallest blast-radius first (RFC link is one line), then the CLAUDE.md inline extension, then the README section (the largest deliverable). All three land in one commit so the cross-link target exists when the link does. Run `npm test` + `npm run typecheck` once at the end to confirm the docs-only diff doesn't break the build hook.

Anchor commitment: H2 is exactly `## Recovering from engine.paused` → GitHub slug `recovering-from-enginepaused` (period dropped per GitHub autoslug). RFC link uses this slug literally; if anchor rendering fails locally, fix the H2 wording rather than the slug.

---

## Task 1: Extend CLAUDE.md `Triage subroutine` bullet with `cycle triage --dry-run` reference

### Overview
Add one inline sentence to the existing `Triage subroutine` bullet at `CLAUDE.md:40` naming `cycle triage --dry-run` as the operator iteration handle when `engine.paused` fires. Payload field names are already in this bullet — do not duplicate them.

### Changes Required
**File**: `/Users/timothyjohnson/wrk/cycle/CLAUDE.md`
**Changes**: In the long bullet starting `- Triage subroutine:` at L40, insert a sentence immediately after the existing `engine.paused { reason: "all_triage_failed", … }` clause and before the `cli.ts` sentence. Suggested wording:

> Operators iterate on a paused engine via `cycle triage --dry-run` (see Commands table) to re-run the prompt against current raws without mutating state; see [Recovering from engine.paused](README.md#recovering-from-enginepaused) for the full recovery flow.

Keep the trailing `` `--dry-run` skips triage `` sentence unchanged — it refers to the engine flag, not the diagnostic. Do NOT merge or rephrase the two.

### Success Criteria
- [ ] Bullet still parses as one bullet (no accidental list break).
- [ ] `cycle triage --dry-run` appears in the bullet exactly once.
- [ ] `--dry-run skips triage` (engine flag) still present at the bullet's tail, unmodified.
- [ ] Grep `last_errors` in CLAUDE.md still returns the existing reference at L40 (no accidental removal).
- [ ] README cross-link target slug matches Task 3's H2 exactly.

---

## Task 2: Add forward cross-link from RFC-001 §5 to README recovery section

### Overview
One-line addition to the closing paragraph of RFC-001 §5 "Triage failure handling" pointing operators at the README recovery flow.

### Changes Required
**File**: `/Users/timothyjohnson/wrk/cycle/docs/RFC-001-issue-lifecycle.md`
**Changes**: At L225, replace:

```
If ALL raws fail triage in one pass (suggests broken prompt or API outage): emit `engine.paused` and exit. Don't start any cycle from a corrupted triage.
```

with:

```
If ALL raws fail triage in one pass (suggests broken prompt or API outage): emit `engine.paused` and exit. Don't start any cycle from a corrupted triage. See [Recovering from engine.paused](../README.md#recovering-from-enginepaused) for the operator recovery flow.
```

Path is `../README.md` because the file lives in `docs/`. Slug is `recovering-from-enginepaused` (no period — GitHub autoslug drops punctuation).

### Success Criteria
- [ ] Link target file `../README.md` resolves from `docs/RFC-001-issue-lifecycle.md`.
- [ ] Slug `recovering-from-enginepaused` matches Task 3's H2 character-for-character (lowercase, hyphenated, no period).
- [ ] No surrounding paragraph re-flow; only the trailing sentence is added.
- [ ] §13 "engine.paused recovery" bullet at L418 is untouched (out of scope).

---

## Task 3: Add `## Recovering from engine.paused` section to README.md

### Overview
Primary deliverable. Self-contained operator runbook: payload shape → inspection → iterate with `cycle triage --dry-run` → delete-vs-edit guidance → re-fire → safety guarantee.

### Changes Required
**File**: `/Users/timothyjohnson/wrk/cycle/README.md`
**Changes**: Append the following new H2 after the existing `## Cycle behavior` block (after L10). The H2 text must be exactly `## Recovering from engine.paused` so the GitHub slug resolves to `recovering-from-enginepaused`.

Structure to write (final wording is the author's call; this is the required content shape):

1. **One-sentence intro.** When all raws fail triage in a single pass, the engine emits `engine.paused {reason: "all_triage_failed", raw_ids, last_errors}` and exits non-zero without mutating `raw/` or `tbd.jsonl`.
2. **Payload reference.** Show the JSON shape with the three fields verbatim:
   ```jsonc
   {
     "reason": "all_triage_failed",
     "raw_ids": ["<id>", "..."],
     "last_errors": [{ "raw_id": "<id>", "error": "<≤2000 chars, head-kept>" }]
   }
   ```
   Note that each `error` is capped at 2000 chars (head-kept, trailing `…` on overflow).
3. **Inspection command.** Tail the audit log to find the event:
   ```sh
   tail -n1 .cycle/log.jsonl | jq 'select(.event == "engine.paused")'
   ```
4. **Iterate-with-dry-run loop.** Re-run the triage prompt against current raws without mutating state:
   ```sh
   cycle triage --dry-run
   ```
   Describe the output shape (`Array<{raw_id, status, attempts, last_error?, children?}>`) and the exit code contract (0 if every raw passes, 1 otherwise). Phrase mirrors the CLAUDE.md Commands table row, do not invent new semantics.
5. **Delete-vs-edit guidance for malformed raws.** Two options:
   - **Edit `raw/<id>.md`** if the issue is real but the content tripped the prompt (typo, missing context, ambiguous title). Re-run `cycle triage --dry-run` until it passes.
   - **Delete `raw/<id>.md`** (`rm docs/cycle/issues/raw/<id>.md`) if the issue should not have been queued at all (duplicate, obsolete reflection finding, etc.).
6. **Re-fire command.** Once `cycle triage --dry-run` exits 0, resume the engine the same way it was originally invoked (e.g., `cycle` or `./.cycle/bin/cycle.js`). Use the same invocation form the operator used to hit the pause — do not prescribe a single canonical command since the engine entry point is invocation-context-dependent.
7. **Safety guarantee statement.** Re-firing picks up cleanly because the failed pass never wrote to `raw/`, `tbd.jsonl`, or `done/_raw.md` — only the audit log (`.cycle/log.jsonl`) recorded the failure. No rollback or cleanup step is required before re-firing.

### Success Criteria
- [ ] H2 reads exactly `## Recovering from engine.paused` (slug check: `recovering-from-enginepaused`).
- [ ] All three payload field names (`reason`, `raw_ids`, `last_errors`) appear in the section.
- [ ] `cycle triage --dry-run` appears at least once with a copy-pasteable code fence.
- [ ] Both delete and edit paths are documented for malformed raws.
- [ ] Safety guarantee statement names `raw/` AND `tbd.jsonl` as unmutated; names `.cycle/log.jsonl` as the only side effect.
- [ ] Section is self-contained — an operator following only this section can recover the engine without reading CLAUDE.md or RFC-001 first.
- [ ] No contradictions with `CLAUDE.md:40` `Triage subroutine` bullet or RFC-001 §5 closing paragraph (re-read both before final draft).

---

## Task 4: Verify build + typecheck + coverage unchanged

### Overview
Docs-only diff must not break the `pretest` build hook or trip coverage thresholds. Run the standard verification commands.

### Changes Required
**File**: none.
**Changes**: Run, in order:

```sh
npm test
npm run typecheck
npm run test:coverage
```

### Success Criteria
- [ ] `npm test` exits 0.
- [ ] `npm run typecheck` exits 0, no warnings.
- [ ] `npm run test:coverage` exits 0; line ≥ 95%, branch ≥ 75%, function ≥ 90% — unchanged vs master baseline (docs-only diff should not touch coverage).
- [ ] Coverage numbers reported in `BUILD.md` / `FIX.md` outputs match this expectation.

---

## Testing Strategy

### Unit Tests
None. SPEC §Testing Strategy is explicit — no new tests; existing suite must remain green. No mocking discussion applies (no code touched).

### Integration / E2E Tests
None. Editorial verification replaces automated tests for this cycle:
- Re-read `README.md` `## Recovering from engine.paused` end-to-end as if responding to a paused-engine alert; confirm every command is actionable from the doc alone with no forward references.
- Grep `reason`, `raw_ids`, `last_errors` in both `README.md` and `CLAUDE.md` — must each appear at least once in both files.
- Confirm `CLAUDE.md:40` mentions `cycle triage --dry-run` exactly once and still ends with the unmodified `` `--dry-run` skips triage `` engine-flag sentence.
- Render the RFC anchor link locally (GitHub preview or markdown renderer) to confirm `../README.md#recovering-from-enginepaused` resolves to the new H2.

## Risk Assessment
- **Anchor slug mismatch between RFC link and README H2.** Mitigation: H2 wording is fixed at `## Recovering from engine.paused`; slug `recovering-from-enginepaused` is hard-coded in Task 2 and verified in Task 3. Both edits land in the same commit so the link is never broken at HEAD.
- **Conflation of engine `--dry-run` with `cycle triage --dry-run` in CLAUDE.md L40.** Mitigation: Task 1 inserts the new sentence before the existing trailing `--dry-run skips triage` clause and explicitly does not modify it.
- **Empty-diff workflow gating tripping `verify`.** Risk near-zero — three doc files change, the diff is guaranteed non-empty. CHANGELOG.md fallback intentionally skipped per RESEARCH §Open Questions.
- **Future docs drift if `engine.paused` payload changes.** Out of scope to mitigate this cycle. README and CLAUDE.md will need a coupled update if `src/engine/triage.ts:237–245` payload field names ever change; flag for the reflection step rather than this plan.
```

Plan written to stdout: 4 tasks (CLAUDE.md bullet extension, RFC-001 §5 cross-link, README recovery H2, verify build/typecheck/coverage). All decisions resolved — anchor slug `recovering-from-enginepaused` committed, RFC §13 bullet left untouched, CHANGELOG.md skipped.
