---
id: refl-0256-stepresult-type-lives-in-exec-bash-ts-bu
title: Move StepResult type from exec-bash.ts to shared exec-types.ts
workflow: feature
depends_on: []
triaged_at: "2026-05-26T11:06:58.235Z"
source: triage
priority: low
---
## Problem

`StepResult` is defined in `src/engine/exec-bash.ts` because that file predated rate-limit detection. The type now carries `rateLimited?: true` — a field `execBashStep` never sets, since bash steps are explicitly excluded from rate-limit detection. The type's home is misleading: the one agent excluded from rate-limit detection owns the shared result type used by every other exec module.

Each new field added to `StepResult` deepens the confusion — future contributors will look in the wrong place and wonder why bash owns a field it ignores.

## Task

Move `StepResult` to a canonical shared module and re-export from `exec-bash.ts` for backwards compatibility.

### Steps

1. Create `src/engine/exec-types.ts` containing the `StepResult` type definition (move verbatim from `exec-bash.ts`).
2. In `exec-bash.ts`, remove the local definition and add: `export type { StepResult } from "./exec-types.js";`
3. Update direct imports in other `exec-*.ts` modules and engine files to import `StepResult` from `./exec-types.js` rather than `./exec-bash.js`. The re-export means this is a cleanup step, not a correctness requirement — do it to remove the misleading indirection.
4. Run `npm run typecheck` — zero errors allowed.
5. Run `npm test` — full suite must pass, no coverage regression.

## Acceptance criteria

- `StepResult` canonical definition lives in `src/engine/exec-types.ts`.
- `exec-bash.ts` re-exports it so no existing import paths break.
- `typecheck` clean, full test suite green.
- Zero behavior change — pure type/file reorganization.

## Notes

- `exec-types.ts` is the right name if only `StepResult` (and any closely related exec result types) live there. If the file would stay small, `types.ts` is also acceptable — use judgment based on what else may migrate there.
- No new coverage floor is required for a types-only file, but verify `check:invariants` still passes after the move.
