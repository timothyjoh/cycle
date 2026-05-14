Now write spec to stdout.

```markdown
# SPEC — Cycle 0043: Pin frontmatter byte-shape on `cycle run "<text>"` path

## Objective
The `cycle run "<text>"` convenience path and `cycle drop "<text>"` share `materializeFreeformIssue` as their writer, so both emit the same raw-issue frontmatter today (including `priority: 3`). Only `drop` has e2e coverage on that frontmatter shape; the `run "<text>"` path is unpinned. Add a focused e2e assertion so future divergence between the two call sites (e.g. wiring `--priority N` onto `drop` only) cannot silently change the `run "<text>"` byte shape without tripping a test.

## Source Issue
`refl-0019-cycle-run-text-path-shares-writer-but-no` — "Pin frontmatter byte-shape on `cycle run \"<text>\"` path (or collapse with `drop`)"

## Scope

### In Scope
- One new e2e test in `tests/cli/multi-loop.test.ts` that spawns `cycle run "<some text>" --dry-run` against a temp repo and asserts the resulting `docs/cycle/issues/raw/<id>.md` frontmatter contains the same fields the `drop` test pins, in particular `priority: 3`.

### Out of Scope
- Refactoring `cli.ts` to collapse the `drop` and `run "<text>"` branches into a shared helper (Option B in the issue). Bodies differ structurally — `drop` emits `issue.dropped` JSON and exits; `run` flows into the engine loop — so extraction is not "near-identical" and would expand scope beyond pinning byte-shape.
- Adding `--priority N` to `run` or `drop` (`drop` already has it; `run` is tracked separately).
- Changing the default `priority: 3` value or any frontmatter field name/format.
- Changing triage's handling of the `priority` field.

## Requirements
- **Functional:** `cycle run "<text>" --dry-run` continues to materialize a raw-issue file via `materializeFreeformIssue`. No production-code change is required to satisfy the spec — this is a coverage-pinning cycle.
- **Test isolation:** the new test must run against a temp repo (mirror the existing `drop` test's `mkdtemp` + `ensureDist` setup) and clean up via `rm(root, { recursive: true, force: true })`.
- **Test must use `--dry-run`** so the engine does not attempt to load `.cycle/workflows.yml`, triage, or spawn agents — the test scope is the materialize call only.
- **Assertion fidelity:** the new test must assert the exact `priority: 3` line (or an equivalent byte-shape check on the frontmatter) so that a future divergence between the `drop` and `run` call sites — e.g. someone passing a non-default priority to `materializeFreeformIssue` on the `drop` path only — fails the test.

## Acceptance Criteria
- [ ] New test in `tests/cli/multi-loop.test.ts` (or sibling) runs `cycle run "<text>" --dry-run` end-to-end and reads back the raw-issue file from `docs/cycle/issues/raw/`.
- [ ] Test asserts `priority: 3` appears in the raw file's frontmatter.
- [ ] Test asserts `source: text` and the title/body match the text argument, mirroring the existing `drop` assertion at `tests/cli/multi-loop.test.ts:123`.
- [ ] Test fails if `materializeFreeformIssue` is bypassed on the `run "<text>"` path, OR if the default priority on the `run` path is changed away from `3`.
- [ ] `npm test` passes (342+ tests, including the new one).
- [ ] `npm run typecheck` passes with no warnings.
- [ ] `npm run test:coverage` passes; line ≥ 95%, branch ≥ 75%, function ≥ 90%. No per-file regressions.

## Testing Strategy
- **Framework:** Node's native `node:test` runner (existing convention in `tests/cli/multi-loop.test.ts`).
- **Style:** e2e — `spawnSync("node", [distPath, "run", "<text>", "--dry-run"], { cwd: tempRoot })`, then `readFile` the resulting `docs/cycle/issues/raw/<id>.md`. Reuse `ensureDist`, `mkdtemp`, and `rm` cleanup pattern from the neighboring `drop` test.
- **Scenarios to cover:**
  - Happy path: `cycle run "park this too" --dry-run` writes a raw file with `priority: 3` in frontmatter and the body containing the text.
  - The test pairs structurally with the existing `'drop' materializes an issue to raw/ without running` test so the two assertions stay in lockstep.
- **E2E tooling:** Playwright is not required — this is a CLI-only change with no UI surface.

## Documentation Updates
- **CLAUDE.md / AGENTS.md:** no convention or command changes — this cycle adds test coverage only.
- **README.md:** no user-facing change.

Documentation is part of "done" — confirmed N/A here because the cycle adds a regression test against an existing, already-shipped behavior.

## Dependencies
- `dist/cycle.js` (built by `pretest` via `npm run build`) — already required by the existing `multi-loop.test.ts` and unchanged here.
- Node ≥ 22.6 (uses `--experimental-strip-types`) — already a project baseline.
- No new external services, env vars, or dependencies.
```
