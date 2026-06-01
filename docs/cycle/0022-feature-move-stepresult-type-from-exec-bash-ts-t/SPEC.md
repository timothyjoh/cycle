# SPEC — Cycle 0022: Relocate StepResult to a Canonical exec-types Module

## Objective
The `StepResult` type — the shared result shape returned by every exec lane (bash, claudecode, codex, gemini, auggie, opencode, pi) — currently lives in `src/engine/exec-bash.ts`. That file predates rate-limit detection, and `StepResult` now carries a `rateLimited?: true` field that `execBashStep` never sets, since bash steps are explicitly excluded from rate-limit detection. The home is misleading: the one lane excluded from a feature owns the type that feature added. This cycle relocates the canonical `StepResult` definition to a new `src/engine/exec-types.ts` module and re-exports it from `exec-bash.ts` so no import path breaks. It is a pure type/file reorganization with zero behavior change, and it removes a recurring source of contributor confusion as new fields accrue on `StepResult`.

## Source Issue
`refl-0256-stepresult-type-lives-in-exec-bash-ts-bu` — "Move StepResult type from exec-bash.ts to shared exec-types.ts"

## Scope

### In Scope
- Create `src/engine/exec-types.ts` holding the `StepResult` type definition, moved verbatim (including the `rateLimited?` and `timedOut?` fields and their doc comment) from `src/engine/exec-bash.ts`.
- In `exec-bash.ts`, replace the local `StepResult` definition with `export type { StepResult } from "./exec-types.ts";` (backwards-compatible re-export), and repoint the direct importers (`exec-spawn.ts`, `exec.ts`, `run-cycle.ts`) to import `StepResult` from `./exec-types.ts`.

### Out of Scope
- Adding, removing, or renaming any field on `StepResult`, or changing any field's type.
- Migrating other types or moving any logic into `exec-types.ts` beyond `StepResult`.
- Any runtime, control-flow, or rate-limit-detection behavior change in any exec lane.
- Adding a new per-file coverage floor for the new module (types-only file).

## Requirements
- The canonical `StepResult` definition must reside in `src/engine/exec-types.ts`.
- `exec-bash.ts` must re-export `StepResult` so that the import path `./exec-bash.ts` (and `./exec-bash.js`) continues to resolve the type unchanged.
- All direct `StepResult` importers within `src/engine/` (`exec-spawn.ts`, `exec.ts`, `run-cycle.ts`) must import from `./exec-types.ts`. The `run-cycle.ts` value import of `execBashStep` from `./exec-bash.ts` must remain, with only the `type { StepResult }` portion repointed.
- The moved type definition must be byte-for-byte equivalent in shape: same field names, same optionality, same union members, same doc comment.
- **Non-functional**: zero runtime behavior change — bundle output and emitted events must be identical to the pre-change baseline.
- **Failure behavior**: this is a compile-time type relocation with no runtime surface, no input parsing, and no external dependency. The only observable failure mode is a build/typecheck failure: if any import path is left dangling or the re-export is malformed, `npm run typecheck` must fail with a non-zero exit and a resolution/type error naming the offending module — never silently produce a broken bundle. There is no degraded-but-working runtime mode to define.

## Acceptance Criteria
- [ ] `src/engine/exec-types.ts` exists and exports `StepResult` with fields `status`, `exitCode`, `stdout`, `stderr`, `rateLimited?`, and `timedOut?` (with its doc comment) identical to the prior `exec-bash.ts` definition.
- [ ] `exec-bash.ts` contains `export type { StepResult } from "./exec-types.ts";` and no local `StepResult` type declaration.
- [ ] `exec-spawn.ts`, `exec.ts`, and `run-cycle.ts` import `StepResult` from `./exec-types.ts`; `run-cycle.ts` still imports the `execBashStep` value from `./exec-bash.ts`.
- [ ] `npm run typecheck` exits 0 with zero errors.
- [ ] `npm test` (full suite) passes with no coverage regression against the master baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%).
- [ ] `npm run check:invariants` passes after the move.
- [ ] Failure-path: deliberately removing the `exec-bash.ts` re-export (or leaving an importer pointed at a non-existent symbol) causes `npm run typecheck` to exit non-zero with a module-resolution/type error — confirming dangling references surface at build time rather than producing a silently broken bundle. (Verified by reasoning/inspection; not committed.)
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced.

## Testing Strategy
- Framework: the existing `node --experimental-strip-types` test runner via `npm test` (auto-builds first).
- Primary verification is the type system: `npm run typecheck` proves every `StepResult` reference resolves through the new module and the re-export.
- Run `npm run test:coverage` to confirm no coverage regression and that the structural-invariants and coverage gates pass.
- Regression coverage: the full existing suite exercises every exec lane's `StepResult` consumers (bash, agent spawn, run-cycle rate-limit/timeout/completion-proof paths); a green suite confirms zero behavior change. No new tests are required for a types-only relocation, but if the suite reveals an import gap, fix the import rather than the test.
- No happy-path/failure-path runtime cases to add: the deliverable has no new runtime surface; the failure surface is compile-time and is validated by typecheck.
- No UI changes; no E2E tests required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Update the `## Architecture` notes that name `exec-*` modules to mention `src/engine/exec-types.ts` as the canonical home of `StepResult` (re-exported from `exec-bash.ts` for compatibility), if a one-line addition keeps the section accurate. No command or convention changes.
- **README.md**: No user-facing change to surface (internal refactor).

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `src/engine/exec-bash.ts`, `src/engine/exec-spawn.ts`, `src/engine/exec.ts`, and `src/engine/run-cycle.ts` must exist with the current `StepResult` definition and import sites (they do).
- No external services or environment variables required.
- Node ≥ 22.6 with `--experimental-strip-types` (existing project runtime).
