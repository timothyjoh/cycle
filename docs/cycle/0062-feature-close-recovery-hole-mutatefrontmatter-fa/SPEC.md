```markdown
# SPEC — Cycle 0062: Stamp failed/<id>.md even when mutateFrontmatter throws in terminalDrain

## Objective

Close the recovery hole where `terminalDrain` in `src/cli.ts` silently moves a
todo file to `failed/<id>.md` without `failed_at` / `failed_step` /
`failed_attempts` / `last_cycle_id` stamps whenever `mutateFrontmatter` throws
(e.g. malformed or absent YAML frontmatter). Operators inspecting `failed/` to
diagnose a halted engine currently see a file with no failure metadata; the
truth is buried in `log.jsonl`. After this cycle, the failed/ file always
carries the stamps — either from a successful mutation, or from a
write-from-scratch fallback that preserves the original body bytes.

## Source Issue

`refl-0025-mutatefrontmatter-failure-silently-drops` — "Close recovery hole:
mutateFrontmatter failure in terminalDrain silently drops failed_* stamps"

## Scope

### In Scope

- Change `terminalDrain` in `src/cli.ts` so that when `mutateFrontmatter`
  throws, the engine writes `failed/<id>.md` *with* stamps via an atomic
  tmp-rename fallback that preserves the original body bytes (best-effort)
  and records the original mutation error as a forensic field in the
  frontmatter.
- Update the existing regression test
  `tests/cli/queue-drain.test.ts` › "terminal failure with malformed
  frontmatter: file still moves, warning logged" to pin the new contract:
  failed/`<id>`.md must carry `failed_at`, `failed_step`, `failed_attempts`,
  `last_cycle_id`, plus a forensic field naming the mutation error. The
  `queue.drain_warning` event remains emitted (now alongside the stamped
  file rather than masking the loss).

### Out of Scope

- Retry / backoff for `mutateFrontmatter` failures.
- Changing the rest of the drain pipeline (`drainFailedTerminal`,
  `propagateBlocked`, queue row removal) — those continue to run after the
  fallback write.
- The success-path `mutateFrontmatter` happy path — already stamped, no
  change.
- The success-drain helper `drainSuccess` — no failed_* stamps to lose.
- Filesystem-error variants of `mutateFrontmatter` (read EACCES, write
  ENOSPC). Treat any thrown error symmetrically through the same fallback;
  do not add per-cause branching.
- Halt-policy changes — `terminalDrain` still increments the engine-side
  `consecutive_failures` counter via the caller path that's already wired.

## Requirements

- When `mutateFrontmatter(todoPath, …)` throws inside `terminalDrain`:
  1. Capture the original body bytes via `readFile(todoPath, "utf8")`
     (best-effort — `ENOENT` falls through to an empty body).
  2. Build a fresh `Frontmatter` containing the same fields the happy-path
     mutation would have written: `failed_at` (new ISO string),
     `failed_step` (if present), `failed_attempts`, `last_cycle_id`, plus
     a `drain_error: "<mutateErr.message>"` field naming the underlying
     cause. If the original body parsed successfully but the *write* leg
     failed, prefer preserving its already-existing keys; otherwise emit
     only the failure stamps.
  3. Serialize via the existing `serializeFrontmatter(fm, bodyAfter)` and
     write `failed/<id>.md` atomically (`<failedPath>.tmp` →
     `rename`).
  4. Unlink the original `todoPath` (ignore `ENOENT`).
  5. Continue with `drainFailedTerminal`, `propagateBlocked`,
     `queue.drained`, `issue.failed` — same order, same payloads, no new
     events.
- The existing `queue.drain_warning` event continues to fire with the
  original `mutateErr.message`. Its reason field is unchanged for
  back-compat with downstream parsers.
- If the fallback write itself throws, re-throw to the caller (engine
  halts naturally via the existing failure-counter path; do not swallow).
- No behavior change on the happy path (`mutateFrontmatter` succeeds):
  byte-identical output, same event order, same exit code.

## Acceptance Criteria

- [ ] Regression test in `tests/cli/queue-drain.test.ts` for the malformed
      -frontmatter case asserts every stamp (`failed_at`, `failed_step`,
      `failed_attempts`, `last_cycle_id`, `drain_error`) is present in
      `failed/<id>.md`. The original body bytes (e.g. `"body only\n"`)
      remain reachable after the frontmatter block.
- [ ] `queue.drain_warning` is still emitted with `reason` matching
      `/mutateFrontmatter failed/`. (Existing assertion preserved.)
- [ ] A new focused unit-level test (same file, same test pattern) covers
      the "frontmatter parses but tmp-write fails" branch — easiest to
      simulate by creating the todo file as a *directory* at the tmp path
      location or by stubbing the write seam. If a directory-trap is too
      fiddly, drop the case here and document the gap in BUILD.md; the
      malformed-frontmatter case is the load-bearing one.
- [ ] All existing tests pass.
- [ ] Coverage gate holds: line ≥ 95%, branch ≥ 75%, function ≥ 90%
      project-wide; `src/engine/triage.ts` per-file line ≥ 95% (unchanged
      area).
- [ ] `npm run typecheck` clean.

## Testing Strategy

- Node native test runner via `npm test`. Reuse the bootstrap helpers
  already in `tests/cli/queue-drain.test.ts`.
- Happy path is implicitly covered by existing terminal-drain tests in
  the same file ("terminal failure: file moves to failed/, stamps
  applied"); confirm they still pass byte-for-byte.
- Adversarial: the "broken-fm" todo (body without `---` frontmatter) is
  the canonical failure trigger. Re-use it; add stamp assertions on the
  failed/ file content.

## Documentation Updates

- **CLAUDE.md**: Extend the "Architecture quick reference" bullet that
  describes `terminalDrain` (currently mentions stamping `failed_at`,
  `failed_step`, `failed_attempts`, `last_cycle_id` via "deferred
  mutateFrontmatter flush") to note the fallback: on mutation failure,
  the failed/`<id>`.md is written from scratch with the same stamps plus
  `drain_error: "<message>"`. Single sentence; no new section.
- **README.md** "Recovering from `engine.paused`": if the recovery
  section enumerates failed/ frontmatter fields, add `drain_error` to
  the list. Otherwise no change.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies

- Existing `serializeFrontmatter` / `parseFrontmatter` helpers in
  `src/engine/frontmatter.ts` — no schema change required.
- Existing `drainFailedTerminal`, `propagateBlocked`, and logger plumbing
  in `src/cli.ts` and `src/engine/queue.ts` — no signature change.
- No new external services, env vars, or workflow defaults.
```
