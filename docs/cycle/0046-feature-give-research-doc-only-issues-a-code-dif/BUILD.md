## Summary

Implemented the per-issue `expects_code: false` frontmatter opt-out that relaxes the build-phase empty-diff guard for research/doc-only issues, completing all four PLAN.md tasks.

**Code (`src/engine/run-cycle.ts`, +~60 lines):** Added the `parseFrontmatter` import and two pure exported helpers — `resolveExpectsCode(fm)` (typed `Record<string, unknown>` to keep the `=== false` structural check TS2367-free; returns `false` only for an explicit boolean `expects_code: false`, else `true` fail-closed) and `parseDocDeliverablePaths(stdout)` (keeps `docs/**` paths that are not denied and not under the per-cycle `docs/cycle/**` artifact tree; handles untracked/modified/rename entries). Wired a new first branch inside the existing empty-diff guard block: when the diff is empty it lazily reads the still-in-`todo/` source issue, resolves the flag, and — only when `expects_code === false` **and** a non-empty in-scope doc deliverable exists — leaves `r.status = "ok"` so the cycle completes normally; otherwise the unchanged `NOOP.md` marker gate and `formatEmptyDiffGuardError` failure run byte-for-byte. The doc scan uses `git status --porcelain --untracked-files=all -- docs` (Task 1/2 deviation, see below).

**Tests (`tests/engine/run-cycle-expects-code.test.ts` new, +47 lines; `tests/engine/empty-diff-guard.test.ts` extended, +~110 lines):** A table-driven unit test for both helpers (including the malformed/non-boolean `expects_code: "maybe"` → `true` failure-path) and four integration cases driving the guard end-to-end on a real git repo with a fake `claude` on PATH — happy path (opt-out + empty code diff + non-empty `docs/RFC-x.md` ⇒ `cycle.end ok`, build `step.end ok` cardinality-pinned `filter(...).length === 1`, no `cycle.noop`, deliverable left in tree), anti-slop regression (existing no-opt-out case preserved), and two failure paths (opt-out + no deliverable ⇒ build failed; unreadable/missing issue file ⇒ defaults `true`, guard fires).

**Docs:** `docs/ENGINE.md` gains an `expects_code: false` opt-out subsection (field, default, relaxed condition, in-scope-deliverable detector, precedence, anti-slop guarantee) under the no-op section; `CLAUDE.md` Workflow defaults references the opt-out. README enumerates no frontmatter-field list (only `priority` in prose), so per the SPEC conditional it was left unchanged.

**Failure modes handled:** missing/unreadable issue file or unparseable frontmatter degrades to the safe `expects_code: true` default via `try/catch` (never throws out of the guard, never a silent `ok`) — covered by the unreadable-issue test; a failed/non-zero `git status` doc scan is treated as no deliverable (relaxation withheld, existing failure surfaces) — the safe direction; a no-deliverable opt-out cycle still fails (`docs/cycle/**` excluded) — covered by the no-deliverable test; non-boolean values resolve to `true` — covered by the unit table. The read is a pure, retry-safe `readFile` performed only on the empty-diff path.

**Test command:** `npm test` → `tests 1085, pass 1085, fail 0`. **Coverage:** `npm run test:coverage` — all per-file floors hold; `src/engine/run-cycle.ts` 100.00% (≥ 90% floor), `path-utils.ts` 100%, no regressions; `coverage-gate: ok` across the board and `structural-invariants: ok`. `npm run typecheck` clean.

**Deviation from PLAN.md:** The plan's `parseDocDeliverablePaths` is correct, but the guard's `git status` call needed `--untracked-files=all` — without it git collapses a freshly-created untracked `docs/` subtree to a single `?? docs/` entry, which `parseDocDeliverablePaths` would (correctly, given that input) treat as an in-scope deliverable and wrongly relax the no-deliverable case. The flag makes git list per-file so the `docs/cycle/**` exclusion works; the helper itself is unchanged from the plan. No other deviations.

**Deferred/follow-up:** None — scope fully delivered. (The deliverable is committed by the supervisor's unchanged `commitCycle`, which runs outside `runCycle`; the happy-path test asserts the file is left in the tree for that path rather than asserting a commit, matching the existing `empty-diff-guard.test.ts` convention.)

## Touched Files
- src/engine/run-cycle.ts
- tests/engine/empty-diff-guard.test.ts
- tests/engine/run-cycle-expects-code.test.ts
- docs/ENGINE.md
- CLAUDE.md
- docs/RFC-001-issue-lifecycle.md
