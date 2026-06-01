# Research: Cycle 0022

## Cycle Context
This cycle relocates the canonical `StepResult` type — the shared result shape returned by every exec lane (bash, claudecode, codex, gemini, auggie, opencode, pi) — from `src/engine/exec-bash.ts` to a new `src/engine/exec-types.ts` module, then re-exports it from `exec-bash.ts` so no import path breaks. The motivation is naming hygiene: `StepResult` now carries a `rateLimited?: true` field that `execBashStep` never sets (bash is excluded from rate-limit detection), so the type's current home is misleading. The change is a pure type/file reorganization with zero runtime behavior change; the only sanctioned failure surface is a compile-time `typecheck` error if an import is left dangling.

## Current Codebase State

### Relevant Components
- `StepResult` type definition (the thing being moved): `src/engine/exec-bash.ts:5-13` — a `type` alias with fields `status: "ok" | "failed"`, `exitCode: number`, `stdout: string`, `stderr: string`, `rateLimited?: true`, and `timedOut?: true`. The `timedOut?` field carries the doc comment `/** Set when the step was killed by the per-step wall-clock timeout. */` (`exec-bash.ts:11`).
- `execBashStep` function (the value export that must remain in `exec-bash.ts`): `src/engine/exec-bash.ts:15-36` — returns `Promise<StepResult>`; only ever sets `status`, `exitCode`, `stdout`, `stderr` (never `rateLimited` or `timedOut`).
- `ExecModule` interface (type-only importer): `src/engine/exec.ts:1` imports `import type { StepResult } from "./exec-bash.ts";`; uses it as the return type at `exec.ts:34` (`runStep(...): Promise<StepResult>`).
- `runAgent` (type-only importer): `src/engine/exec-spawn.ts:5` imports `import type { StepResult } from "./exec-bash.ts";`; used at `exec-spawn.ts:22` (return type), `exec-spawn.ts:40` (`new Promise<StepResult>`), and `exec-spawn.ts:51` (`const done = (r: StepResult) => …`).
- `runCycle` (mixed value+type importer): `src/engine/run-cycle.ts:4` imports `import { execBashStep, type StepResult } from "./exec-bash.ts";`. The `execBashStep` value import must stay pointed at `./exec-bash.ts`; only the `type { StepResult }` portion is repointed. `StepResult` is used at `run-cycle.ts:399` (`let r: StepResult = { status: "failed", exitCode: -1, stdout: "", stderr: "" };`).

### Existing Patterns to Follow
- Import-extension convention: all intra-`src/engine/` imports use explicit `.ts` extensions (e.g. `"./exec-bash.ts"`, `"./child-env.ts"` at `exec-bash.ts:3`, `exec.ts:2-7`). The SPEC's acceptance criteria text uses `"./exec-types.ts"`; the CLAUDE.md/issue text mentions `.js`, but the actual codebase uses `.ts` extensions in source imports. The re-export and new importers should match the surrounding `.ts`-extension style.
- Type-only import style: importers that use only the type use `import type { … }` (`exec.ts:1`, `exec-spawn.ts:5`); the mixed importer uses inline `type` qualifier (`run-cycle.ts:4`, `import { execBashStep, type StepResult }`).
- Re-export pattern for backwards compatibility: the SPEC prescribes `export type { StepResult } from "./exec-types.ts";` in `exec-bash.ts`. There is no existing `export type { … } from` re-export pattern elsewhere in `src/engine/` to copy verbatim, but this is standard TS syntax.
- No existing `types.ts` / `exec-types.ts` module exists in `src/engine/` — this cycle creates the first one (confirmed: no `src/engine/*types*` files present).
- Failure handling in the change area: not applicable at runtime — this is a compile-time type relocation. `StepResult` itself is the carrier for the engine's failure semantics (`status: "failed"`, `rateLimited?`, `timedOut?`), but those fields are set by consumers, not by the type definition being moved. The only defined failure mode is a `npm run typecheck` non-zero exit if a reference dangles (SPEC.md:27, 36).
- Observability: none introduced or touched by this change. `StepResult.rateLimited` / `timedOut` feed the engine's structured `.cycle/log.jsonl` events (rate-limit retry, completion-proof, timeout salvage) but no event emission is in scope.
- Idempotency / retry-safety: not applicable — no runtime surface, no persistence, no locks involved.

### Dependencies & Integration Points
- `src/engine/exec-bash.ts` — current home of `StepResult`; becomes the re-export site. Also exports `execBashStep` (value), which stays.
- `src/engine/exec.ts` — type-only consumer (`ExecModule.runStep` return type). Repoint to `./exec-types.ts`.
- `src/engine/exec-spawn.ts` — type-only consumer (`runAgent`). Repoint to `./exec-types.ts`.
- `src/engine/run-cycle.ts` — mixed consumer. Repoint only the `StepResult` type import; keep the `execBashStep` value import on `./exec-bash.ts`.
- Six agent exec modules (`exec-claudecode.ts`, `exec-codex.ts`, `exec-auggie.ts`, `exec-gemini.ts`, `exec-opencode.ts`, `exec-pi.ts`) — per `docs/ENGINE.md:309`, each produces `StepResult`-shaped values (`{ ...r, status: "failed", rateLimited: true }`) but **none of them import the `StepResult` type by name** (grep confirms only `exec.ts`, `exec-spawn.ts`, `run-cycle.ts`, and `exec-bash.ts` reference the `StepResult` identifier in `src/`). They are structurally-typed callers of `runAgent`/`isRateLimitError` and require no import change. SPEC scope names only the three direct importers.
- Test files referencing `StepResult` (by name in test descriptions only, not as imports): `tests/engine/exec-pi.test.ts:156`, `exec-opencode.test.ts:148`, `exec-gemini.test.ts:61`, `exec-codex.test.ts:148`, `exec-claudecode.test.ts:29`, `exec-auggie.test.ts:159`. These are string literals in test names, not type imports — no change required.
- Test files importing the `execBashStep` **value** from `exec-bash.ts`: `tests/engine/child-env.test.ts:7`, `tests/engine/exec-bash.test.ts:6`. These import the value, not the type, so they are unaffected by the type relocation (the value stays in `exec-bash.ts`).
- No external services, env vars, or runtime config involved.

### Test Infrastructure
- Test framework: Node's built-in test runner via `node --test --experimental-strip-types` (`package.json:25`). `test:coverage` adds `--experimental-test-coverage` with LCOV output to `.cycle/coverage.lcov` (`package.json:27`).
- Test conventions: tests live under `tests/engine/*.test.ts`, named to mirror the source module (e.g. `tests/engine/exec-bash.test.ts` for `src/engine/exec-bash.ts`). Imports use relative `../../src/engine/<module>.ts` paths.
- Current coverage of the change area: `StepResult` consumers are exercised indirectly by the full suite — bash (`exec-bash.test.ts`), agent spawn (`exec-spawn` paths via the per-agent tests), and `run-cycle.ts` rate-limit/timeout/completion-proof paths. SPEC.md:44 states a green suite confirms zero behavior change; no new tests are required for a types-only relocation.
- Failure-path test coverage: the failure mode for this cycle is compile-time (`typecheck`), not runtime. SPEC.md:36 specifies the failure-path is verified "by reasoning/inspection; not committed" — deliberately breaking the re-export should cause `npm run typecheck` to exit non-zero. No committed runtime failure test is expected.
- Gates that must still pass after the move: `npm run typecheck` (zero errors), `npm run check:coverage` (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%; no per-file floor required for the new types-only module per SPEC.md:19), and `npm run check:invariants`.

## Code References
- `src/engine/exec-bash.ts:5-13` — current `StepResult` definition to move verbatim (including the `timedOut?` doc comment at line 11).
- `src/engine/exec-bash.ts:15-36` — `execBashStep`, which stays in `exec-bash.ts`.
- `src/engine/exec.ts:1` — `import type { StepResult } from "./exec-bash.ts";` to repoint.
- `src/engine/exec-spawn.ts:5` — `import type { StepResult } from "./exec-bash.ts";` to repoint.
- `src/engine/run-cycle.ts:4` — `import { execBashStep, type StepResult } from "./exec-bash.ts";` — split: keep `execBashStep` on `./exec-bash.ts`, repoint `StepResult` to `./exec-types.ts`.
- `scripts/structural-invariants.mjs:12-44` — `INVARIANTS` table; **no entry references `exec-bash`, `exec-types`, `StepResult`, or `exec.ts`**, so the move triggers no structural-invariant change. The table is the single source of truth (CLAUDE.md → Structural-invariants policy).
- `docs/ENGINE.md:307-309` — documents `StepResult` as "defined in `src/engine/exec-bash.ts`"; this reference becomes stale after the move (SPEC.md:48-49 calls for updating Architecture notes; this ENGINE.md line is the concrete doc string naming the old home).
- `docs/ENGINE.md:7` — engine-modules list enumerating `exec`, `exec-bash`, `exec-claudecode`, … `exec-spawn`; a new `exec-types` module is not yet listed.
- `package.json:25,27` — test and coverage runner definitions.
- `CLAUDE.md` → "## Architecture" section names `src/engine/log-fmt.ts`, `path-utils.ts`, etc. with one-line descriptions; SPEC.md:49 asks to add a one-line mention of `exec-types.ts` as the canonical `StepResult` home if it keeps the section accurate.

## Open Questions
- **Import extension (`.ts` vs `.js`)**: source imports throughout `src/engine/` use `.ts` extensions (e.g. `exec.ts:1-7`), and SPEC.md's acceptance criteria (lines 31-32) write `"./exec-types.ts"`. The original issue text (`refl-0256`) and CLAUDE.md examples use `.js`. The planner should follow the live codebase convention (`.ts`), but should confirm against `tsconfig.json` module-resolution settings if any ambiguity arises.
- **Doc-update scope**: SPEC.md:48-49 calls for updating CLAUDE.md Architecture notes and conditionally adding a one-line `exec-types.ts` mention. `docs/ENGINE.md:309` also literally states `StepResult` is "defined in `src/engine/exec-bash.ts`" — the planner should decide whether updating this ENGINE.md sentence is in scope for "done" (SPEC.md:52 states documentation is part of done) or out of scope (SPEC.md lists only CLAUDE.md/README under Documentation Updates).
- **Whether to repoint the six agent exec modules**: confirmed by grep that none import the `StepResult` identifier by name, so no change is needed there; the planner should treat the three named importers (`exec.ts`, `exec-spawn.ts`, `run-cycle.ts`) as the complete set of repoint sites.
