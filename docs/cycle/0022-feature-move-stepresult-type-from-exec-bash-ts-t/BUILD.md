## Summary

This cycle relocated the canonical `StepResult` type from `src/engine/exec-bash.ts` to a new dedicated `src/engine/exec-types.ts` module, a pure type/file reorganization with zero behavior change. Created `src/engine/exec-types.ts` (9 lines) holding the `StepResult` definition moved verbatim — same field names (`status`, `exitCode`, `stdout`, `stderr`, `rateLimited?`, `timedOut?`), same optionality, same union members, and the same `timedOut` doc comment. In `src/engine/exec-bash.ts` replaced the 9-line local type declaration with a two-line backwards-compatible re-export plus a local `import type` (the file's own `Promise<StepResult>` return annotation still resolves): `export type { StepResult } from "./exec-types.ts";` and `import type { StepResult } from "./exec-types.ts";`. Repointed the three direct importers — `src/engine/exec-spawn.ts`, `src/engine/exec.ts` (each one import line), and `src/engine/run-cycle.ts` (split the combined import so the `execBashStep` value still comes from `./exec-bash.ts` and only `type { StepResult }` repoints to `./exec-types.ts`). Updated `CLAUDE.md` `## Architecture` with a one-line note naming `exec-types.ts` as the canonical home re-exported from `exec-bash.ts`. README.md needed no change (internal refactor).

All PLAN.md tasks are complete: new module created, re-export added, all three importers repointed, docs updated. `npm run typecheck` exits 0 with zero errors, confirming every `StepResult` reference resolves through the new module and the re-export. Full suite: `npm test` → tests 881, pass 881, fail 0. Coverage: `npm run test:coverage` → all-files Branch 87.23% (≥ 75%); every per-file floor passed via `coverage-gate` (including `run-cycle.ts` 100%, `exec-spawn.ts` 100%) with no regression, and `structural-invariants` passed. No new per-file floor was added for the types-only module (out of scope per SPEC).

Failure modes: the only observable failure surface for a compile-time type relocation is build/typecheck failure on a dangling import or malformed re-export — `npm run typecheck` exits non-zero with a module-resolution/type error naming the offending module rather than silently producing a broken bundle, as verified by the green typecheck across all four touched modules. No runtime input parsing, timeout, or fallback paths exist to add tests for; the existing 881-test suite (which exercises every exec lane's `StepResult` consumers — bash, agent spawn, and run-cycle's rate-limit/timeout/completion-proof paths) passing green confirms zero behavior change, so no new tests were required.

No deviations from PLAN.md. No deferred work or follow-up notes.

## Touched Files
- src/engine/exec-types.ts
- src/engine/exec-bash.ts
- src/engine/exec-spawn.ts
- src/engine/exec.ts
- src/engine/run-cycle.ts
- CLAUDE.md
