---
id: refl-0203-buildchildenv-strip-and-re-inject-contra-structural-invariant
title: "Add structural invariant: exec-*.ts must pass cycleEnv to buildChildEnv"
workflow: feature
depends_on: []
triaged_at: "2026-05-21T05:14:48.128Z"
source: triage
parent: refl-0203-buildchildenv-strip-and-re-inject-contra
---
## Context

`buildChildEnv` in `src/engine/child-env.ts` strips all `CYCLE_*` vars by prefix. The re-injection contract requires every caller in `src/engine/exec-*.ts` to pass required `CYCLE_*` vars back via the `extra` argument — in practice, via `cycleEnv` (which carries `CYCLE_ID`, `CYCLE_BASE`, `CYCLE_TITLE`, etc.).

All current callers comply, but there is no static enforcement. Adding a new `exec-*.ts` agent (as has happened multiple times for `pi`, `auggie`, `opencode`) could silently omit re-injection. The subprocess would see `undefined` for those vars with no runtime error.

## Task

Add a structural invariant to `scripts/structural-invariants.mjs` that asserts every `src/engine/exec-*.ts` file calling `buildChildEnv` also references `cycleEnv`.

Implementation approach (two-pass grep):
1. Collect all `exec-*.ts` files containing the string `buildChildEnv`.
2. For each matched file, assert `cycleEnv` appears somewhere in that file.
3. If any file fails, emit a descriptive error naming the file and quoting the contract requirement.

The check is intentionally coarse — presence of `cycleEnv` in the same file is sufficient signal. A file that genuinely doesn't need `CYCLE_*` vars (e.g. a pure-env utility) can be added to an explicit exemption list inside the invariant with a comment explaining why.

## Acceptance criteria

- `npm run check:invariants` passes on the current codebase (all `exec-*.ts` files that call `buildChildEnv` already reference `cycleEnv`).
- The invariant description makes the re-injection contract machine-readable — a future engineer adding `exec-foo.ts` will see a failing invariant if they omit `cycleEnv`.
- No coverage floor changes required (invariant scripts are not subject to per-file floors).
- `npm test` passes with no regressions.
