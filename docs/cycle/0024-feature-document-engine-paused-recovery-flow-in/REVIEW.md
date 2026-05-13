```markdown
# Review: Cycle 0024

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md

## Code Quality Review

### Summary
Docs-only diff, mechanically clean: three additive edits across `CLAUDE.md`, `README.md`, and `docs/RFC-001-issue-lifecycle.md`. PLAN tasks 1, 2, 3, 4 all complete and matched line-for-line by the diff. Anchor slug `recovering-from-enginepaused` is consistent between the README H2, the CLAUDE.md cross-link, and the RFC-001 §5 cross-link. **However**, the README's recovery narrative contradicts the actual engine behavior in `src/engine/triage.ts` (see Adversarial Review and MUST-FIX Task 1) — the doc describes a flow that fails in practice the moment `engine.paused` fires.

### Findings
1. **Spec accuracy / Doc-vs-code drift (Critical)**: README claims `engine.paused` exits "without mutating `raw/` or `tbd.jsonl`" and tells operators to edit `raw/<id>.md`. The implementation moves every failed raw to `docs/cycle/issues/failed/<id>.md` via `moveToFailed` *before* emitting `engine.paused`, and stamps `triage_attempts` into each raw's frontmatter on every retry via `bumpAttempts`. By the time an operator sees the pause, `raw/` is empty and the files live in `failed/` — the documented recovery flow does not work. — `README.md:13`, `README.md:51–56`, `README.md:62–65`; root cause at `src/engine/triage.ts:204` (`bumpAttempts`) and `src/engine/triage.ts:225` (`moveToFailed`, called inside the per-raw failure branch before the `failed.length === raws.length` check at `src/engine/triage.ts:233`).
2. **Misleading dry-run semantics for the recovery use case (Critical, same root cause as #1)**: README step 2 tells operators to loop on `cycle triage --dry-run` until exit `0`. `dryRunTriage` reads `docs/cycle/issues/raw` (`src/engine/triage.ts:267–269`); after a pause that directory is empty and dry-run exits `0` on `loadRaws` returning `[]`. The "exit 0 means recovered" signal is therefore false-positive in exactly the situation the doc is written for. — `README.md:41–49`.
3. **Incomplete log.jsonl side-effect statement (Minor, folded into MUST-FIX Task 1)**: README "Safety guarantee" says the only side effect is the `engine.paused` line, but the pass also emits one `triage.raw.failed` per attempt per raw (`src/engine/triage.ts:205–209`) before the final pause. Honest, not load-bearing for recovery, but worth fixing in the same edit. — `README.md:64–65`.
4. **CLAUDE.md edit is correct (No issue)**: the new sentence at the existing `Triage subroutine` bullet (`CLAUDE.md:40`) cleanly inserts between the `engine.paused` payload clause and the `cli.ts` clause, leaves the trailing `--dry-run skips triage` engine-flag sentence unmodified, and the cross-link slug matches. — `CLAUDE.md:40`.
5. **RFC-001 cross-link is correct (No issue)**: one trailing sentence added to §5 closing paragraph, relative path `../README.md#recovering-from-enginepaused` is right (file lives in `docs/`), slug matches the README H2 character-for-character. §13 open-question bullet untouched per plan. — `docs/RFC-001-issue-lifecycle.md:225`.

### Spec Compliance Checklist
- [x] `README.md` contains a `## Recovering from engine.paused` H2 with payload description, inspection commands, `cycle triage --dry-run` iteration loop, delete-vs-edit guidance, safety guarantee — **structurally present, factually wrong** (see findings 1, 2, 3).
- [x] `CLAUDE.md`'s `Triage subroutine` bullet mentions `reason`, `raw_ids`, `last_errors`, and `cycle triage --dry-run`.
- [x] `docs/RFC-001-issue-lifecycle.md` §5 contains forward link to README recovery section, correct slug.
- [x] No CHANGELOG.md entry needed (three doc edits already produce a non-empty diff). Correctly omitted.
- [x] `npm test` passes — 286/286.
- [x] `npm run typecheck` passes — clean, no warnings.
- [x] Coverage thresholds preserved — line 97.14%, branch 90.64%, function 96.21% (vs floor 95/75/90); no per-file regressions, no `src/` files touched.
- [ ] **README section is self-contained and actionable from cold** — fails because following the doc literally on a paused engine produces "file not found" errors (raws are in `failed/`, not `raw/`). SPEC requirement: "an operator who has never recovered an `engine.paused` before can follow it without reading CLAUDE.md or the RFC first."
- [ ] **No prose contradictions with the existing `engine.paused` description elsewhere in the doc set** — README's "no `raw/` mutation" silently contradicts RFC-001 §5, which explicitly documents per-raw `Move raw/<id>.md → failed/<id>.md` (`docs/RFC-001-issue-lifecycle.md:215–220`).

## Adversarial Test Review

### Summary
N/A by design — SPEC §Testing Strategy and PLAN §Testing Strategy both state explicitly that this is a docs-only cycle with no new tests and editorial verification only. Existing 286-test suite remains green, coverage unchanged. **Editorial verification was the test surface for this cycle, and it failed**: the doc was not cross-checked against `src/engine/triage.ts`'s actual behavior, only against the SPEC author's mental model of it. The grep-for-payload-fields and slug-resolution checks listed in PLAN §Integration / E2E Tests all pass, but none of them would catch the recovery-flow-is-fiction problem — those checks are structural, not semantic.

### Findings
1. **Editorial verification gap (Process)**: PLAN's verification steps grep for the three field names and confirm the RFC slug resolves. Neither check exercises whether the documented recovery flow actually works against the engine's behavior. A more honest editorial check for this cycle would have been: "after a simulated `engine.paused`, can an operator reach a clean re-fire by following only the README?" That question, applied retroactively to the diff, returns no — see Findings 1–2 in the Code Quality section.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: 97.14% / 90.64% / 96.21%
- Regressions vs base (per-file): none — no `src/` files were touched.
- New code without tests: none — no new code.
- Specific scenarios missing tests: N/A — docs-only cycle. The relevant missing *verification* is editorial, not unit-test-shaped (see Adversarial Findings above).
```

End-of-turn: MUST-FIX written to `docs/cycle/0024-feature-document-engine-paused-recovery-flow-in/MUST-FIX.md`. REVIEW above goes to the same dir as `REVIEW.md` via stdout capture. Verdict: NEEDS-FIX — README recovery flow contradicts `src/engine/triage.ts` (failed raws live in `failed/`, not `raw/`, by the time `engine.paused` fires).
