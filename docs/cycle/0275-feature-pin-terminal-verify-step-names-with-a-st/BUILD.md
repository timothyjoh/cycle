`workflows.yml` is byte-identical to HEAD (no diff). All quality gates green.

## Summary

Added a build-time structural invariant that pins each default workflow's terminal `scripts/verify.sh` bash step name to the degenerate-verification gate's recognized literals (`verify`/`final_verify`), with the recognized set derived from the gate's own source rather than re-declared. Modified `scripts/structural-invariants.mjs` (+~130 lines: added a `readFileSync` import, three module-level regex/path constants, two exported pure helpers `deriveGateVerifyNames` and `extractVerifyStepNames`, the exported predicate `validateVerifyStepNames`, and one registered relational `INVARIANTS` entry against `src/defaults/workflows.yml`); `tests/scripts/structural-invariants.test.ts` (+~180 lines: extended `setup()` to write a synthetic `src/defaults/workflows.yml` + gate-literal `src/engine/run-cycle.ts` so the whole-tree spawn tests stay green, added 18 in-process tests, and updated the import); and `CLAUDE.md` (+1 line in the structural-invariants policy section). All PLAN.md tasks (1–6) are complete. During implementation I deviated from the PLAN's windowing detail: the gate comment contains `step.end{failed}`, so windowing from the anchor to the first `{` captured zero literals — the derivation now first locates the `if (` after the anchor comment, then windows from there to the opening brace (covered by a dedicated test, `comment-brace before the if is not the window boundary`).

Test suite: `npm run test:coverage` → 1285 tests, 1285 pass, 0 fail. Coverage for `scripts/structural-invariants.mjs`: line 98.42%, branch 97.53%, function 100% (per-file floor 90% — no regression; `coverage-gate` and `check:invariants` both green). `npm run typecheck` clean.

Failure modes handled (all fail-closed, none swallowed): unreadable gate source → `{ ok:false, message }` naming the path (caught `readFileSync`, tested via a `chdir` to a temp root lacking the file); no derivable gate literals (missing anchor / no `step.name` literals / anchor with no following `if`) → `ok:false`; unparseable `workflows.yml` (no `workflows:` block, or a `verify.sh` line with no resolvable `name:`/enclosing workflow) → `ok:false`; out-of-set step name → `ok:false` naming workflow + step; a throwing predicate is contained as a FAIL by the dispatch (existing containment path, re-exercised). Drift-coupling is proven by a test injecting alternate gate literals and asserting the accepted set tracks them. Manual spot-check: renaming `feature`'s `verify` → `verify_app` made `node scripts/structural-invariants.mjs` exit 1 naming `feature` and `verify_app`; reverted (`workflows.yml` confirmed byte-identical to HEAD via `git diff`).

No deferred work. `src/defaults/` was not modified (only a temporary, reverted spot-check), so `npm run sync-defaults` is not required.

## Touched Files
- scripts/structural-invariants.mjs
- tests/scripts/structural-invariants.test.ts
- CLAUDE.md
- docs/ENGINE.md
