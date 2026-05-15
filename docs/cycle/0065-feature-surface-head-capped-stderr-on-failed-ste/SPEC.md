Got context. Writing spec now.

```markdown
# SPEC — Cycle 0065: Surface head-capped stderr on failed bash step.end events

## Objective
When `execBashStep` returns `status: "failed"`, the engine currently emits `step.end {status, exit_code}` and discards the captured `stderr` — masking the actual root cause from `log.jsonl` and forcing operators to manually re-run failing bash scripts to diagnose. This cycle attaches a head-capped `stderr` field to failed `step.end` events from the bash path so the audit log is self-sufficient.

## Source Issue
`refl-0028-stderr-dropped-on-failed-bash-step` — "Surface head-capped stderr on failed step.end events from execBashStep"

## Scope

### In Scope
- `src/engine/run-cycle.ts:169` — extend the single `step.end` emit so that when `r.status === "failed"` AND the step ran via the bash path (`step.agent === "bash"`), the payload includes `stderr: <head-capped string>`. Successful step.end events keep their current shape (no `stderr` field).
- Truncation: reuse the engine's existing 2000-char head-capped convention (see `src/engine/triage.ts:231-233` — `s.length > MAX_ERR_LEN ? s.slice(0, MAX_ERR_LEN - 1) + "…" : s`). Inline a local constant; cross-link the existing helper in REFLECTION.md rather than refactoring both call sites this cycle.

### Out of Scope
- Agent-path step.end events (`claudecode` / `codex` / `gemini`) — verify in BUILD.md whether the same masking applies; surface as a follow-up issue if so, but do NOT modify here.
- Changing log schema beyond adding the optional `stderr` field.
- Refactoring `execBashStep`'s capture mechanism — stderr is already captured at `src/engine/exec-bash.ts:23`.
- Extracting a shared `truncateError(s, max)` helper across triage / step.end — defer until a third call site appears.

## Requirements
- A failed bash step emits `step.end {cycle_id, step, status:"failed", exit_code, stderr}` where `stderr` is the captured child stderr, head-capped to 2000 chars with trailing `…` on overflow.
- A successful bash step emits `step.end {cycle_id, step, status:"ok", exit_code}` with NO `stderr` key (keeps log readable).
- Agent-path step.end events are unchanged by this cycle.
- The cap matches the existing `engine.paused` truncation convention (2000 chars, slice to `MAX-1` + `…`).

## Acceptance Criteria
- [ ] `tests/engine/run-cycle.test.ts` asserts `step.end` carries `stderr` on a failed bash step and the captured stderr matches the child output (exact string for sub-cap payloads).
- [ ] Same test file asserts a successful bash step's `step.end` has no `stderr` key (`!("stderr" in payload)`).
- [ ] A test asserts the truncation boundary: stderr longer than 2000 chars is sliced to 1999 chars + `…` (total 2000), matching the triage convention.
- [ ] All existing tests still pass (`npm test`).
- [ ] `npm run typecheck` clean.
- [ ] Coverage gates hold: line ≥95%, branch ≥75%, func ≥90%; per-file floor `src/engine/triage.ts ≥95%` untouched.
- [ ] No `step.end` payload shape changes for the agent path.

## Testing Strategy
- Framework: Node native test runner (already wired). New tests go in `tests/engine/run-cycle.test.ts` (or a sibling file under `tests/engine/` that exercises the bash step.end seam — pick whichever file already drives `execBashStep` through `runCycle`; if none, drive `execBashStep` directly and assert against a recording logger).
- Key scenarios:
  1. **Happy path**: bash step exits 0 → `step.end` lacks `stderr`.
  2. **Failure path**: bash step exits non-zero with short stderr → `step.end.stderr` is the verbatim captured string.
  3. **Truncation**: bash step fails with stderr ≥ 2001 chars → `step.end.stderr.length === 2000` and ends in `…`.
- Tests should drive real bash scripts (echo to stderr + `exit 1`) rather than mocking `execBashStep`, since the production seam is `runCycle` → `execBashStep` → `log.emit`.

## Documentation Updates
- **CLAUDE.md** — under "Architecture quick reference", add a one-line note that failed bash `step.end` events carry head-capped `stderr` (2000-char convention) while successful events do not.
- **README.md** — no user-facing change; the audit log is internal. Skip unless a section already describes `step.end` payloads.
- **REFLECTION.md** (cycle artifact) — note the duplicated 2000-char truncation constant between `triage.ts` and `run-cycle.ts` as a candidate consolidation when a third caller lands.

## Dependencies
- None new. `execBashStep` already captures stderr (`src/engine/exec-bash.ts:5-10,21-23`).
- Existing logger (`src/engine/log.ts`) accepts arbitrary payload keys — no schema layer to update.
```
