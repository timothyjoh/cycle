---
id: refl-0021-triage-ts-per-file-line-coverage-93-5-be
title: Cover triage.ts fault-handling catches + enforce per-file line floor
workflow: feature
depends_on: []
triaged_at: "2026-05-13T19:06:29.695Z"
source: triage
---
## Why

`src/engine/triage.ts` reports **93.50% line / 92.41% branch / 96.88% function** coverage as of cycle 0021. Branch and function clear the project baselines (75 / 90), but line is **below the 95% line baseline** — and the gate is silent because aggregate `src/` line coverage is 96.70%, so the per-file drift hides behind the average.

The untested lines live in exactly the wrong place: best-effort `catch` clauses inside the only writer that moves files out of `raw/` and mutates `tbd.jsonl`. From BUILD.md / source:

- `loadRaws` — catch around per-file read/parse.
- `bumpAttempts` — catch around frontmatter rewrite of `raw/<id>.md`.
- `moveToFailed` — catch around the failure-stamp + rename to `failed/`.
- `rewriteOrdering` — catch around the in-place reorder of `tbd.jsonl` rows.
- `runClaudecodeAgent` subprocess plumbing — error paths around spawn / stdout consumption.

These fire precisely when fs / queue invariants are already shaky (read-only fs, concurrent rename, disk-full, stale handle). A silent swallow there can leave the queue inconsistent: row written but file unmoved, file moved but row stale, retry counter not bumped. Each new triage feature widens this surface, and the aggregate gate will keep masking it until a catch actually fires in prod.

## Scope

1. **Fault-injection tests** in `tests/triage.test.ts` (or a new `tests/triage.faults.test.ts`) exercising each catch:
   - `loadRaws`: malformed frontmatter / unreadable `raw/<id>.md` — engine surfaces a `triage.failed` or `engine.warning` event and continues with the remaining raws rather than crashing.
   - `bumpAttempts`: stub `fs.writeFile` (or the frontmatter writer) to throw — verify per-raw retry still advances and we don't lose attempt accounting.
   - `moveToFailed`: stub `fs.rename` to throw on the `raw/ → failed/` move — verify we emit a structured warning, do **not** drop the row, and leave the file in `raw/` for human recovery (no partial state where row is gone but file remains, or vice versa).
   - `rewriteOrdering`: stub the `tbd.jsonl` write to throw mid-rewrite — verify ordering is left untouched on disk (atomic tmp-rename invariant) and the failure is reported.
   - `runClaudecodeAgent`: spawn error / non-zero exit / unparseable stdout — covered partially today; fill the remaining catch lines.

   Use the existing tmp-repo harness; prefer dependency-injection of an fs shim where the production code already takes one, otherwise use a focused `mock.method` on `node:fs/promises`.

2. **Per-file line floor for `src/engine/triage.ts`** so future regressions surface immediately instead of hiding behind the aggregate. Two acceptable shapes — pick one in the plan:
   - Extend the existing coverage-gate script to read the per-file table and fail when `src/engine/triage.ts` line coverage drops below **95%**, OR
   - Bake the floor into the `build` / `fix` workflow prompt so the agent treats per-file regressions in triage.ts as blocking even when aggregate is green.

   Whichever path is chosen, document the floor in `CLAUDE.md` alongside the existing baseline table.

## Acceptance

- `src/engine/triage.ts` line coverage ≥ 95% after the new tests land.
- Each of the five fault paths above has at least one assertion on the emitted event / queue state, not just "does not throw".
- Per-file floor mechanism is in place and proven by a deliberate red test (temporarily remove one of the new tests, confirm the gate fails, restore it).
- `CLAUDE.md` coverage section mentions the `src/engine/triage.ts` per-file floor.

## Non-goals

- Refactoring the catch clauses themselves. The goal is coverage + invariant assertions, not redesigning the error model. If a catch is genuinely dead code, note it in BUILD.md/FIX.md and delete in a follow-up cycle rather than expanding scope here.
- Raising the project-wide line baseline. This task only adds a per-file floor for the highest-leverage writer.
