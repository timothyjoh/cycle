# Review: Cycle 0046

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A tight, well-scoped Option-B implementation: two pure exported helpers plus a single new first-branch inside the existing empty-diff guard. The change is fail-closed throughout (every read/scan error degrades to the stricter `expects_code: true` / no-deliverable direction, never a silent `ok`), reuses the existing `commitCycle` path end-to-end, and preserves the anti-slop failure byte-for-byte for non-opt-out issues. Build, typecheck, full suite, coverage floors, and structural invariants all pass.

### Findings
1. **Benefit delivery (verified end-to-end)**: The SPEC's CONCRETE USER BENEFIT — "doc deliverable is committed and the issue moves to `done/`" — is genuinely realizable. The relaxed branch leaves `r.status = "ok"` (`src/engine/run-cycle.ts:806`), and `stageFiles` in `commitCycle` stages every non-denied `git status --porcelain --untracked-files=all` path including out-of-`docs/cycle/` doc files (`src/engine/commit-cycle.ts:77-99`), so the deliverable is actually committed by the unchanged path. Not merely mechanically passing — the promised capability is present.
2. **Failure handling (fail-safe)**: Issue read/parse wrapped in `try/catch` → safe `true` default (`src/engine/run-cycle.ts:796-802`); a non-zero/spawn-error doc scan yields `docDeliverable = false` via the `docs.status === 0 &&` guard (`:815-816`), withholding relaxation rather than fabricating an `ok`. No swallowed-into-success path exists — every error route surfaces the existing `formatEmptyDiffGuardError` or no-op. Correct fail-open-vs-fail-safe posture.
3. **Idempotency**: The added work is a single `readFile` of a still-in-`todo/` file plus a read-only `git status` — both pure, retry-safe, performed only on the empty-diff path so the common code-bearing path incurs no extra I/O (`src/engine/run-cycle.ts:795`, `:810`).
4. **Precedence is deterministic**: Relaxed branch checked first, NOOP marker gate and failure moved verbatim into the `else` (`src/engine/run-cycle.ts:806-845`), matching the documented ordering.
5. **Minor — `--untracked-files=all` necessity is reasoned, not pinned by a discriminating test**: The PLAN→BUILD deviation correctly added the flag so a freshly-created untracked `docs/` *subtree* lists per-file (`src/engine/run-cycle.ts:810`). No integration case places the deliverable in a brand-new untracked subdirectory (e.g. `docs/adr/0001.md`) where removing the flag would collapse to `?? docs/` and wrongly relax the no-deliverable case. Coverage is 100% and the behavior is correct; this is a robustness-of-regression-guard note only, not a defect.
6. **Minor — README left unchanged (acceptable)**: README references `priority:` in prose (`README.md:166`) but does not enumerate a frontmatter-field list, so the SPEC's conditional README update was correctly skipped. Reasonable builder judgment.

### Spec Compliance Checklist
- [x] `expects_code` boolean field (default `true`) parsed from frontmatter, plumbed to the guard — `src/engine/run-cycle.ts:114-116`, `:796-802`
- [x] Guarded relaxed branch: `expects_code === false` + empty `src scripts tests` diff + non-empty in-scope `docs/**` ⇒ `status: "ok"` — `:804-816`, `:806`
- [x] Resolves `false` only for explicit boolean; absent/non-boolean/malformed/`true` ⇒ `true` (fail-closed) — `:114-116`
- [x] Relaxed path is a normal `ok` completion, **not** `noopDrain`/exit-3 — `r.status` left `"ok"`, no `cycle.noop` emitted
- [x] Opt-out cycle with **no** deliverable still fails — `docs/cycle/**` excluded in `parseDocDeliverablePaths` (`:131`); covered by `EDG-OPTOUT-NODELIV`
- [x] Anti-slop preserved byte-for-byte for non-opt-out issues — `formatEmptyDiffGuardError` path unchanged; covered by existing case
- [x] Missing/unreadable issue → safe `true` default, no throw out of guard — `:801`; covered by `EDG-OPTOUT-MISSING`
- [x] `docs/ENGINE.md` documents the opt-out — `docs/ENGINE.md:214-224`
- [x] All existing tests pass (1085/1085); typecheck clean
- [x] SPEC has a populated `## Acceptance Criteria` section (8 testable bullets)
- [x] PLAN has a complete `## SPEC Acceptance Traceability` section re-quoting all 8 AC bullets verbatim with covering tasks

## Adversarial Test Review

### Summary
Adequate-to-strong. Helpers covered by a table-driven unit test exercising the full fail-closed matrix; integration cases drive the real guard on a real git repo with a fake `claude` on PATH (no `node:fs/promises` mocking). Cardinality pins (`countEvents(...) === 1`) are used for both `step.end` and `cycle.end`, and the relaxed path explicitly asserts **zero** `cycle.noop`.

### Findings
1. **Assertion quality — strong**: Specific event-cardinality assertions (`=== 1` / `=== 0`) rather than weak existence checks — `tests/engine/empty-diff-guard.test.ts:240-263`. Happy path also asserts the deliverable's file *content* is left in tree (`:268`).
2. **Failure paths covered**: no-deliverable (`EDG-OPTOUT-NODELIV`), unreadable issue (`EDG-OPTOUT-MISSING`), malformed `"maybe"` value (unit), and the anti-slop regression are all present — not happy-path-only.
3. **Boundary conditions**: `parseDocDeliverablePaths` unit cases cover rename targets (in-scope and `docs/cycle/` excluded), non-`docs/` paths, blank lines, and `undefined`/whitespace stdout — `tests/engine/run-cycle-expects-code.test.ts:18-45`.
4. **Mock abuse**: none — both helpers are pure; integration uses real repos/files.
5. **Minor gap (see Code Quality #5)**: no case isolates the `--untracked-files=all` flag's effect via a deliverable in a new untracked subdirectory.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function (`src/engine/run-cycle.ts`): 100.00% / 98.00% / 96.55%
- Regressions vs base (per-file): none — every `coverage-gate` line reports `ok` (run-cycle.ts 100.00% ≥ 90%, path-utils.ts 100% ≥ 100%, all floors hold)
- New code without tests: none
- Specific scenarios missing tests: deliverable in a freshly-created untracked `docs/` subdirectory (would lock in the `--untracked-files=all` deviation rationale) — minor

## Doc-vs-Code Claim Verification

Diff touches in-scope doc paths `CLAUDE.md` and `docs/ENGINE.md`. All introduced claims pair to a backing reference at HEAD.

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| "`resolveExpectsCode` returns `false` only for an explicit boolean `expects_code: false`" | `docs/ENGINE.md:216` | `src/engine/run-cycle.ts:114-115` | OK |
| "passing the frontmatter to the pure exported `resolveExpectsCode(fm)` helper" | `docs/ENGINE.md:216` | `src/engine/run-cycle.ts:799` | OK |
| "detector runs `git status --porcelain --untracked-files=all -- docs` … through `parseDocDeliverablePaths(stdout)`" | `docs/ENGINE.md:220` | `src/engine/run-cycle.ts:810`, `:816` | OK |
| "keeps paths under `docs/` … not denied (`isDenied`) and not under `docs/cycle/**`" | `docs/ENGINE.md:220` | `src/engine/run-cycle.ts:129-132` | OK |
| "read+parse wrapped in `try/catch` that degrades to the safe `true` default" | `docs/ENGINE.md:216` | `src/engine/run-cycle.ts:796-802` | OK |
| "relaxed branch is checked **first** … else `formatEmptyDiffGuardError` failure" | `docs/ENGINE.md:222` | `src/engine/run-cycle.ts:806`, `:311`, `:840-842` | OK |
| "completes as a normal `ok` … **not** routed through `noopDrain`/exit-3" | `docs/ENGINE.md:218` | `src/engine/run-cycle.ts:806` (leaves `r.status` ok; no `noopOutcome` set) | OK |
| "failed scan (`git status` non-zero / spawn error) … relaxation withheld" | `docs/ENGINE.md:220` | `src/engine/run-cycle.ts:815` (`docs.status === 0 &&`) | OK |
| "a per-issue YAML-frontmatter field (default `true`)" | `CLAUDE.md:128` | `src/engine/run-cycle.ts:114-115` | OK |
| "checked **before** the `NOOP.md` marker gate" | `CLAUDE.md:128` | `src/engine/run-cycle.ts:806` (vs marker gate `:823-839`) | OK |

No unbacked claims.
