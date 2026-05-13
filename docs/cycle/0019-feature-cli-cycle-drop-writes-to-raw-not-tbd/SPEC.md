# SPEC — Cycle 0019: CLI `cycle drop` Writes to `raw/` (Not `tbd/`)

## Objective
Bring the `cycle drop "<text>"` command into compliance with the post-RFC-001 issue lifecycle by ensuring the materialized file lands in `docs/cycle/issues/raw/` with the exact frontmatter shape that the triage subroutine expects on a raw drop — including the `priority` field that today's `materializeFreeformIssue` omits. This restores parity between external drops (human / agent / CLI) and what triage reads on the next pass.

## Source Issue
`cli-drop-writes-to-raw-fix-drop-target` — "CLI: cycle drop writes to raw/ (not tbd/)"

## Scope

### In Scope
- Update `src/issue/materialize.ts` (the sole writer the `drop` command invokes) so the emitted frontmatter is exactly: `id`, `source: text`, `title`, `added_at`, `triage_attempts: 0`, `priority: 3`. Field order matches the RFC-001 §"Raw drop" example.
- Update `tests/issue/materialize.test.ts` to assert the new `priority: 3` line is present and that all six fields are emitted in stable order.
- Sanity-grep `src/`, `tests/`, `README.md`, `CLAUDE.md` for any lingering folder-name `tbd/` reference (as opposed to the queue-file `tbd.jsonl`, which stays) introduced by the drop path. If `--help` text or any user-visible CLI doc surfaces the drop target, point it at `raw/`.

### Out of Scope
- `cycle status` command (covered by sibling child issue `cli-drop-writes-to-raw-status-command`).
- Any changes to `src/engine/triage.ts` or to how triage *reads* raw frontmatter; we only adjust what gets *written*.
- Honoring `priority` during triage ordering (RFC-001 explicitly calls priority "not honored automatically"); we only emit the field as a default hint.
- A user-facing `--priority` flag on `cycle drop`; out of scope this cycle, defer to a follow-up.
- Cleanup of the historic `docs/plans/2026-05-12-cycle-mvp-dogfood.md` mentions of `tbd/` — those are frozen historical artifacts.

## Requirements
- After the change, `cycle drop "foo"` (no other flags) MUST produce a single file under `docs/cycle/issues/raw/` containing the six required frontmatter keys plus the original body text. The file MUST parse cleanly via `parseFrontmatter` from `src/engine/frontmatter.ts` (no manual reader divergence).
- The default `priority` value MUST be `3` (numeric, unquoted), matching the integer shape triage expects and matching the RFC-001 example's numeric form.
- Existing JSONL contract on stdout (`{event:"issue.dropped", issue_id, path}`) MUST be unchanged — external agents already consume it.
- No code path in `src/` may reference `docs/cycle/issues/tbd/` as a write target (we confirm via grep — currently clean, must remain clean).
- Coverage MUST NOT regress against the master baseline: line ≥ 95 %, branch ≥ 75 %, function ≥ 90 %.
- `npm run typecheck` MUST report zero warnings.

## Acceptance Criteria
- [ ] `cycle drop "fix login bug"` (invoked against a tmp repo via the bundled `dist/cycle.js`) creates exactly one file matching `docs/cycle/issues/raw/txt-<UTC>-fix-login-bug.md`, and its frontmatter contains all six keys in the documented order with `priority: 3`.
- [ ] No file is written to `docs/cycle/issues/tbd/` during the drop (folder is not created, not touched).
- [ ] `tests/issue/materialize.test.ts` asserts (a) path under `raw/`, (b) all six frontmatter keys present including `priority: 3`, (c) body trailing newline preserved.
- [ ] `grep -rn "docs/cycle/issues/tbd" src/ tests/` returns zero matches.
- [ ] `npm test` is green (all tests, including the existing `tests/cli/multi-loop.test.ts:123` "drop materializes an issue to raw/" check, which must continue to pass without modification beyond any frontmatter-related assertion updates if it makes such assertions).
- [ ] `npm run typecheck` is clean.
- [ ] `npm run test:coverage` shows line ≥ 95 %, branch ≥ 75 %, function ≥ 90 % and no per-file regression on `src/issue/materialize.ts` (expected: 100 % line / function after the unit test update).
- [ ] Reported coverage numbers appear in `BUILD.md` and `FIX.md` per the project coverage policy.

## Testing Strategy
- **Framework:** Node's native `node:test` runner, no transpile (`--experimental-strip-types`), invoked via `npm test`.
- **Unit test (`tests/issue/materialize.test.ts`):** extend the existing fixed-clock test to assert the new `priority: 3` line plus a stable field-order check (a single `assert.match` against the full frontmatter block, or six individual `assert.match` calls, whichever stays most readable). Continue to use `mkdtemp` + `rm` for isolation.
- **End-to-end coverage:** the existing `tests/cli/multi-loop.test.ts:123` test already shells out to the built `dist/cycle.js` and checks the drop side-effect; verify it still passes after the materialize change. If that test introspects frontmatter, mirror the new `priority` assertion there too; otherwise leave it untouched to keep the regression surface lean.
- **Cross-cutting:** no new E2E / Playwright tests required — this cycle has no UI surface.
- **Negative path:** no test for "priority override" because no override flag exists yet (deferred). Avoid adding a stub `--priority` flag just to test it.

## Documentation Updates
- **CLAUDE.md / AGENTS.md:** no change expected — the project doc does not currently spell out the `cycle drop` frontmatter contract, and adding it now would duplicate RFC-001 §"Raw drop". If the build step finds that CLAUDE.md *does* mention the drop frontmatter (it does not at the time of this spec), update it; otherwise skip.
- **README.md:** if README documents the `drop` subcommand (current README grep returns no matches), update the example to show the new six-field frontmatter; otherwise skip.
- **`docs/RFC-001-issue-lifecycle.md`:** no change — the RFC §"Raw drop" example already documents the target frontmatter shape; this cycle brings the implementation to that shape, not the other way around.
- Documentation parity is part of "done": after the change, the file `materialize.ts` writes must structurally equal the RFC §"Raw drop" example.

## Dependencies
- BB-1 (folder rename `tbd/ → raw/`, cycle 0012) already merged on `master` — confirmed by `docs/cycle/issues/raw/` existing and `materialize.ts:7` already pointing at `raw/`.
- Triage subroutine (BB-4, cycle 0015) merged — its frontmatter expectations are the spec being aligned to.
- No external services, env vars, or new npm deps required.
- Build pipeline: `dist/cycle.js` must be rebuilt via `npm run build` (pretest covers this automatically) so the end-to-end drop test in `tests/cli/multi-loop.test.ts` exercises the updated materialize.
