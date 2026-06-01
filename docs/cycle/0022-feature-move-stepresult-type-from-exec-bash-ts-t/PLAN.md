# Implementation Plan: Cycle 0022

## Overview
Relocate the canonical `StepResult` type from `src/engine/exec-bash.ts` into a new dedicated `src/engine/exec-types.ts` module, re-export it from `exec-bash.ts` for backwards compatibility, and repoint the three direct `StepResult` importers (`exec.ts`, `exec-spawn.ts`, `run-cycle.ts`) at the new module. Pure type/file reorganization with zero runtime behavior change.

## Current State (from Research)
- `StepResult` is defined at `src/engine/exec-bash.ts:5-13` as a `type` alias with fields `status: "ok" | "failed"`, `exitCode: number`, `stdout: string`, `stderr: string`, `rateLimited?: true`, and `timedOut?: true` (the `timedOut?` field carries the doc comment `/** Set when the step was killed by the per-step wall-clock timeout. */`).
- `execBashStep` (`exec-bash.ts:15-36`) is the **value** export that must stay in `exec-bash.ts`; it only ever sets `status`, `exitCode`, `stdout`, `stderr`.
- Three direct type importers:
  - `src/engine/exec.ts:1` — `import type { StepResult } from "./exec-bash.ts";` (used at the `ExecModule.runStep` return type).
  - `src/engine/exec-spawn.ts:5` — `import type { StepResult } from "./exec-bash.ts";` (used in `runAgent`).
  - `src/engine/run-cycle.ts:4` — `import { execBashStep, type StepResult } from "./exec-bash.ts";` (mixed value+type import).
- The six agent exec modules (`exec-claudecode.ts`, `exec-codex.ts`, `exec-auggie.ts`, `exec-gemini.ts`, `exec-opencode.ts`, `exec-pi.ts`) are structurally typed and do **not** import `StepResult` by name — no change.
- Test files reference `StepResult` only as string literals in test names, and import `execBashStep` only as a value — no test changes required.
- `scripts/structural-invariants.mjs` has no entry referencing `exec-bash`, `exec-types`, `StepResult`, or `exec.ts` — the move triggers no invariant change.
- Existing patterns: all intra-`src/engine/` imports use explicit `.ts` extensions; type-only importers use `import type { … }`; the mixed importer uses the inline `type` qualifier.

### Patterns to Follow
- Use `.ts` import extensions throughout (resolved open question — the live codebase convention is `.ts`, and SPEC acceptance criteria lines 31-32 also write `"./exec-types.ts"`).
- Re-export via standard TS syntax: `export type { StepResult } from "./exec-types.ts";`.
- Keep `import type` for the two type-only consumers; keep the inline `type` qualifier on the mixed import in `run-cycle.ts`.

## Desired End State
- `src/engine/exec-types.ts` exists and is the canonical home of `StepResult`, with the type moved verbatim (all six fields, same optionality, same union members, same doc comment).
- `src/engine/exec-bash.ts` contains `export type { StepResult } from "./exec-types.ts";` and no local `StepResult` declaration; it still exports the `execBashStep` value.
- `exec.ts`, `exec-spawn.ts`, and `run-cycle.ts` import the `StepResult` **type** from `./exec-types.ts`; `run-cycle.ts` still imports the `execBashStep` **value** from `./exec-bash.ts`.
- `npm run typecheck` exits 0; `npm test` passes with no coverage regression; `npm run check:invariants` passes.
- CLAUDE.md and `docs/ENGINE.md` reflect the new canonical home.

**How to verify**: `npm run typecheck` → 0 errors; `npm test` → green with coverage gates passing; `npm run check:invariants` → pass; `grep` confirms no remaining `StepResult` definition in `exec-bash.ts` and no remaining `type { StepResult } from "./exec-bash.ts"` import.

## What We're NOT Doing
- Not adding, removing, renaming, or retyping any field on `StepResult`.
- Not moving any other type or any logic into `exec-types.ts` beyond `StepResult`.
- Not changing any runtime, control-flow, or rate-limit-detection behavior in any exec lane.
- Not adding a new per-file coverage floor for the types-only `exec-types.ts` module (SPEC out-of-scope item).
- Not repointing the six agent exec modules (they do not import `StepResult` by name).
- Not changing any test files (no test imports the moved type; value imports of `execBashStep` are unaffected).
- Not committing a runtime failure-path test — the only failure surface is compile-time `typecheck`, validated by inspection/reasoning.

## Implementation Approach
A single mechanical relocation done as one vertical slice, because the entire change is one cohesive unit that must compile together: create the new module, convert the old definition site into a re-export, and repoint the three importers in the same pass so `typecheck` proves correctness end-to-end. There is no partial/intermediate state worth landing separately — a half-done move would dangle imports. After the code move, update the two documentation references (CLAUDE.md Architecture notes and `docs/ENGINE.md`) so docs match. Verification is driven entirely by the type system plus the existing full suite; no new runtime tests are warranted for a types-only relocation.

The `.ts`-vs-`.js` extension open question is resolved in favor of `.ts` (live codebase convention). The doc-scope open question is resolved by treating both the CLAUDE.md mention and the stale `docs/ENGINE.md:307-309` sentence as in scope for "done," since SPEC.md:52 states documentation is part of done and both are concrete references to the old home.

## Failure & Resilience Decisions

**Task 1 (create `exec-types.ts`)** — N/A — pure. A type-only source file with no runtime, I/O, subprocess, or network surface.

**Task 2 (re-export from `exec-bash.ts` + repoint importers)** — Compile-time only.
- **Failure modes**: the sole failure mode is a dangling import or malformed re-export, which surfaces as a `tsc` module-resolution / type error. There is no runtime degrade path. The code responds by failing the build (non-zero `typecheck` exit) — it does not produce a silently broken bundle.
- **Idempotency**: editing source files is naturally idempotent; re-running the edits (or the engine retrying the step) converges to the same file contents. No state mutation, no persistence, no subprocess spawn during the edit.
- **Observability**: `npm run typecheck` emits the offending module/symbol name to stderr with a non-zero exit; `npm test` (auto-build via `pretest`) would fail loudly if the bundle were broken.
- **No silent failure**: a left-dangling reference cannot be swallowed — it halts the typecheck/build gate. Confirmed by SPEC.md:36 (deliberately breaking the re-export must produce a non-zero `typecheck`).

**Task 3 (docs)** — N/A — pure. Markdown edits, no failure surface.

---

## Task 1: Create `src/engine/exec-types.ts` with the canonical `StepResult`

### Overview
Create the new module holding the `StepResult` type, moved verbatim from `exec-bash.ts` including the `timedOut?` doc comment.

### Changes Required
**File**: `src/engine/exec-types.ts` (new)
**Changes**: Add the type definition, copied byte-for-byte in shape from `exec-bash.ts:5-13`:

```ts
export type StepResult = {
  status: "ok" | "failed";
  exitCode: number;
  stdout: string;
  stderr: string;
  rateLimited?: true;
  /** Set when the step was killed by the per-step wall-clock timeout. */
  timedOut?: true;
};
```

No imports needed (the type references no other module). No runtime code.

### Success Criteria
- [ ] File exists at `src/engine/exec-types.ts`.
- [ ] Exports `StepResult` with fields `status`, `exitCode`, `stdout`, `stderr`, `rateLimited?`, `timedOut?` — identical shape and doc comment to the prior `exec-bash.ts` definition.
- [ ] `npm run typecheck` resolves the new module cleanly.
- [ ] Failure paths behave as designed (N/A — pure; no runtime failure surface).

---

## Task 2: Re-export from `exec-bash.ts` and repoint the three importers

### Overview
Replace the local `StepResult` definition in `exec-bash.ts` with a backwards-compatible re-export, and repoint `exec.ts`, `exec-spawn.ts`, and `run-cycle.ts` at `./exec-types.ts`.

### Changes Required

**File**: `src/engine/exec-bash.ts`
**Changes**: Delete the local `type StepResult = { … };` block (lines 5-13) and replace it with the re-export. `execBashStep` (and its `Promise<StepResult>` return annotation) is unchanged — the re-exported name resolves in-file.

```ts
import { spawn } from "node:child_process";
import { join } from "node:path";
import { buildChildEnv } from "./child-env.ts";

export type { StepResult } from "./exec-types.ts";

export function execBashStep(repoRoot: string, command: string, env: Record<string, string>): Promise<StepResult> {
  // …unchanged…
}
```

**File**: `src/engine/exec.ts`
**Changes**: Line 1 — repoint the type-only import:
`import type { StepResult } from "./exec-types.ts";`

**File**: `src/engine/exec-spawn.ts`
**Changes**: Line 5 — repoint the type-only import:
`import type { StepResult } from "./exec-types.ts";`

**File**: `src/engine/run-cycle.ts`
**Changes**: Line 4 — split the mixed import. Keep the `execBashStep` value on `./exec-bash.ts`; move the `StepResult` type to `./exec-types.ts`:
```ts
import { execBashStep } from "./exec-bash.ts";
import type { StepResult } from "./exec-types.ts";
```
The `StepResult` usage at `run-cycle.ts:399` is unchanged.

### Success Criteria
- [ ] `exec-bash.ts` contains `export type { StepResult } from "./exec-types.ts";` and no local `StepResult` type declaration; `execBashStep` value export unchanged.
- [ ] `exec.ts`, `exec-spawn.ts`, and `run-cycle.ts` import `StepResult` from `./exec-types.ts`.
- [ ] `run-cycle.ts` still imports the `execBashStep` value from `./exec-bash.ts`.
- [ ] `grep -rn "StepResult.*from.*exec-bash" src/` returns no matches (no importer still pointed at the old type home).
- [ ] `npm run typecheck` exits 0 with zero errors.
- [ ] `npm test` (full suite) passes with no coverage regression (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%).
- [ ] `npm run check:invariants` passes.
- [ ] Bundle output / emitted events identical to baseline (zero runtime behavior change).
- [ ] Failure paths behave as designed: deliberately breaking the re-export (by reasoning/inspection) would make `npm run typecheck` exit non-zero with a module-resolution/type error — not committed.

---

## Task 3: Update documentation references

### Overview
Update the two concrete references to the old `StepResult` home so docs match the new canonical location.

### Changes Required

**File**: `CLAUDE.md`
**Changes**: In the `## Architecture` section (the block listing `src/engine/log-fmt.ts`, `path-utils.ts`, etc.), add a one-line mention that `src/engine/exec-types.ts` is the canonical home of `StepResult` (re-exported from `exec-bash.ts` for backwards compatibility). No command or convention changes.

**File**: `docs/ENGINE.md`
**Changes**: At the line that states `StepResult` is "defined in `src/engine/exec-bash.ts`" (around `docs/ENGINE.md:307-309`), update it to name `src/engine/exec-types.ts` as the definition site (re-exported from `exec-bash.ts`). Optionally add `exec-types` to the engine-modules list at `docs/ENGINE.md:7` to keep the enumeration accurate.

### Success Criteria
- [ ] CLAUDE.md `## Architecture` notes mention `exec-types.ts` as the `StepResult` home.
- [ ] `docs/ENGINE.md` no longer states `StepResult` is defined in `exec-bash.ts`; it names `exec-types.ts`.
- [ ] No broken cross-references introduced.
- [ ] Failure paths behave as designed (N/A — pure; documentation edits).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] src/engine/exec-types.ts exists and exports StepResult with fields status, exitCode, stdout, stderr, rateLimited?, and timedOut? (with its doc comment) identical to the prior exec-bash.ts definition.` | Task 1 | |
| `[ ] exec-bash.ts contains export type { StepResult } from "./exec-types.ts"; and no local StepResult type declaration.` | Task 2 | |
| `[ ] exec-spawn.ts, exec.ts, and run-cycle.ts import StepResult from ./exec-types.ts; run-cycle.ts still imports the execBashStep value from ./exec-bash.ts.` | Task 2 | |
| `[ ] npm run typecheck exits 0 with zero errors.` | Task 2 | Verification gate |
| `[ ] npm test (full suite) passes with no coverage regression against the master baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%).` | Task 2 | Verification gate |
| `[ ] npm run check:invariants passes after the move.` | Task 2 | Verification gate |
| `[ ] Failure-path: deliberately removing the exec-bash.ts re-export (or leaving an importer pointed at a non-existent symbol) causes npm run typecheck to exit non-zero with a module-resolution/type error — confirming dangling references surface at build time rather than producing a silently broken bundle. (Verified by reasoning/inspection; not committed.)` | Task 2 | See Failure & Resilience Decisions (Task 2); inspection-only |
| `[ ] All existing tests still pass.` | Task 2 | Verification gate |
| `[ ] No compiler/linter warnings introduced.` | Task 2 | Verification gate |

---

## Testing Strategy

### Unit Tests
- No new unit tests are required for a types-only relocation (SPEC.md:44). The type system is the primary verification mechanism: every `StepResult` reference must resolve through `exec-types.ts` (directly) or through the `exec-bash.ts` re-export (transitively), proven by `npm run typecheck` exiting 0.
- **Failure-path (compile-time)**: the single failure mode — a dangling import or malformed re-export — is exercised by reasoning/inspection per SPEC.md:36. Mentally (or in a throwaway, uncommitted edit) removing the `exec-bash.ts` re-export, or pointing an importer at a non-existent symbol, must make `npm run typecheck` exit non-zero naming the offending module. Not committed.
- **Mocking strategy**: none — there is no runtime surface to mock. The existing suite uses real implementations across all exec lanes.

### Integration / E2E Tests
- The existing full suite (`npm test`) is the regression net: it exercises every `StepResult` consumer — bash (`tests/engine/exec-bash.test.ts`), agent spawn (per-agent tests via `exec-spawn`), and `run-cycle.ts` rate-limit / timeout / completion-proof paths. A green suite confirms zero behavior change.
- Run `npm run test:coverage` to confirm no coverage regression and that the coverage-gate and structural-invariants gates pass.
- If the suite reveals an import gap, fix the import — not the test (SPEC.md:44).

## Risk Assessment
- **A `StepResult` importer is missed and left pointed at `exec-bash.ts`**: low impact — the re-export keeps `exec-bash.ts` resolving the type, so even a missed repoint still typechecks; the `grep` success criterion in Task 2 catches any remaining old-path import for completeness. Mitigation: explicit `grep -rn "StepResult.*from.*exec-bash" src/` check.
- **Accidental field/shape drift when copying the type**: mitigation: copy the block verbatim (Task 1 snippet) and confirm via `npm run typecheck` plus a diff review that the six fields, optionality, union members, and doc comment are byte-identical.
- **Circular import between `exec-bash.ts` and `exec-types.ts`**: none possible — `exec-types.ts` imports nothing; `exec-bash.ts` only re-exports a type from it (erased at runtime). No runtime cycle.
- **Stale doc references missed**: mitigation: Task 3 explicitly updates both known references (CLAUDE.md Architecture, `docs/ENGINE.md:307-309` and the module list at `:7`).
