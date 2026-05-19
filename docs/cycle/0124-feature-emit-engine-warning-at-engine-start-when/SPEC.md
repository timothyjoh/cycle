The engine is capturing stdout from this step and writing it to `SPEC.md` itself. Outputting the spec content directly:

---

# SPEC — Cycle 0124: Emit engine.warning When dist/cycle.js Is Stale at Engine Start

## Objective
Capture process start time at the top of `cli.ts` and, just before emitting `engine.start`, compare `dist/cycle.js` mtime against that instant. When the bundle is newer than the running process, emit one structured `engine.warning` event so operators know the loaded module graph is behind the built artifact. This is a non-fatal surface-only mitigation; the engine continues running regardless.

## Source Issue
`refl-0059-spec-guard-bypassed-by-stale-engine-proc-stale-dist-warning` — "Emit engine.warning at engine.start when dist/cycle.js mtime is newer than process start"

## Scope

### In Scope
- Capture `processStart = Date.now()` at module load in `cli.ts` (before any async work).
- `emitStaleDistWarning(log, processStart, cwd)` helper: stat `dist/cycle.js`, compare mtime, emit `engine.warning` if stale.
- Regression tests (stale, fresh, missing-dist branches) with injected `fs.stat` / clock fakes.

### Out of Scope
- Process-per-cycle architecture (tracked as `refl-0059-spec-guard-bypassed-by-stale-engine-proc-process-per-cycle`).
- Any automatic restart or enforcement action on detecting staleness.
- Changes to triage, queue drain, or any other engine subsystem.

## Requirements
- `processStart` must be captured before any `await` in `cli.ts` so it reflects the true process-start instant.
- `dist/cycle.js` path must be derived from `import.meta.url` or the known bundle output path — not a hardcoded absolute path.
- Warning emitted at most once per engine start, immediately before or after `engine.start` emission.
- Warning payload must include: `reason: "stale_dist"`, `dist_mtime` (ms epoch), `process_start` (ms epoch), `dist_path` (resolved absolute path), and a human-readable `message`.
- No warning emitted when `dist/cycle.js` does not exist (stat ENOENT) — treat as non-stale.
- No warning emitted when mtime <= process start.

## Acceptance Criteria
- [ ] `engine.warning` with `reason: "stale_dist"`, `dist_mtime`, `process_start`, `dist_path`, `message` emitted exactly once when `dist/cycle.js` mtime > process start.
- [ ] No `engine.warning` emitted when `dist/cycle.js` mtime <= process start.
- [ ] No `engine.warning` emitted when `dist/cycle.js` does not exist (stat ENOENT).
- [ ] `processStart` captured before the first `await` in `cli.ts`.
- [ ] All existing tests still pass (`npm test` green).
- [ ] Coverage gates green: line >= 95%, branch >= 75%, func >= 90%; per-file floors for `triage.ts`, `issue-lifecycle.ts`, `commit-cycle.ts` unaffected.
- [ ] No compiler warnings (`npm run typecheck` clean).

## Testing Strategy
- Unit tests for the staleness-check helper using injected `fs.stat` so tests are filesystem-independent.
- Three branches:
  1. **Stale**: stat returns mtime 1 ms after processStart; assert `engine.warning` emitted with correct fields.
  2. **Fresh**: stat returns mtime equal to processStart; assert no `engine.warning` emitted.
  3. **Missing dist**: stat rejects with ENOENT; assert no warning emitted, no throw.
- Run `npm run test:coverage && npm run check:coverage` to verify floors.

## Documentation Updates
- **docs/ENGINE.md**: Add a short note in the engine-start section describing the stale-dist warning: when it fires, what fields it carries, and what operators should do (restart the engine process).
- **CLAUDE.md / AGENTS.md**: No change needed — runtime behavior, not a new command or convention.
- **README.md**: No change needed — operator-facing log event, not a CLI usage change.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `dist/cycle.js` present in all non-first-run environments (built by `npm run build` / `pretest`).
- `node:fs/promises` `stat` already imported in `cli.ts`.
- No new external dependencies required.
