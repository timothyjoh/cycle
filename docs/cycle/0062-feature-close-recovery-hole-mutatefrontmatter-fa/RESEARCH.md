Have enough. Writing research to stdout.

```markdown
# Research: Cycle 0062

## Cycle Context

SPEC calls for closing a recovery hole in `terminalDrain` (`src/cli.ts`): when `mutateFrontmatter` throws (most often: a todo file with malformed/missing YAML frontmatter), the engine currently still moves the file to `failed/<id>.md` and emits `queue.drain_warning`, but the failed/ file lacks the `failed_at` / `failed_step` / `failed_attempts` / `last_cycle_id` stamps that operators need to diagnose a halted engine. After this cycle, the failed/ file must always carry those stamps plus a new `drain_error` forensic field — either via the happy-path mutation, or via a write-from-scratch atomic-tmp-rename fallback that preserves the original body bytes.

## Current Codebase State

### Relevant Components

- `terminalDrain` (the only call site this cycle changes) — `src/cli.ts:120-158`. Wraps `mutateFrontmatter` in a try/catch, then **unconditionally renames** `todoPath → failed/<id>.md`, emits `queue.drain_warning` (only if mutation threw), then calls `drainFailedTerminal`, `propagateBlocked`, and emits `queue.drained` / `issue.failed`. Stamps live inside the `mutateFrontmatter` patch (`failed_at`, `failed_step?`, `failed_attempts`, `last_cycle_id`).
- `terminalDrain` callers — `src/cli.ts:289` (resume path inside `runResumeOnce`) and `src/cli.ts:381` (normal main-loop terminal failure). Both pass `row.attempt + 1` as `failedAttempts`. SPEC says no signature change.
- `mutateFrontmatter` — `src/engine/frontmatter.ts:60-71`. Reads file → `parseFrontmatter(body)` → applies patch → `serializeFrontmatter` → atomic tmp-rename. Throws synchronously from `parseFrontmatter` with `Error("no frontmatter")` when the `^---\n…\n---\n` regex (`FM_RE` at line 8) misses (this is the canonical failure trigger).
- `parseFrontmatter` — `src/engine/frontmatter.ts:21-32`. Returns `{ fm, bodyAfter }` where `bodyAfter = body.slice(m[0].length)`. Throws on missing frontmatter; "body only\n" → throw.
- `serializeFrontmatter(fm, bodyAfter)` — `src/engine/frontmatter.ts:51-58`. Pure; emits `---\n<k: v>…\n---\n<bodyAfter>`. SPEC calls for reusing this for the fallback path. Field iteration order is insertion order of `fm` keys.
- `Frontmatter` type — `src/engine/frontmatter.ts:3-4`. `Record<string, string | number | string[]>` — `drain_error` (string) and `failed_attempts` (number) fit existing value types; no schema extension needed.
- `drainFailedTerminal(repoRoot, id)` — `src/engine/queue.ts:173-177`. Removes the row from `.cycle/tbd.jsonl`. Called after the rename in `terminalDrain`; SPEC says continue to call after fallback in same order.
- `propagateBlocked(cwd, issueId, log)` — wired at `src/cli.ts:155`, defined in `src/engine/blocked.ts`. Reads queue + dependents and stamps `blocked_*` on transitive dependents. Out of scope but must remain unchanged.

### Existing Patterns to Follow

- **Atomic tmp-rename writes** — `mutateFrontmatter` itself models the pattern: `writeFile(path + ".tmp", out, "utf8")` then `rename(tmp, path)` (`src/engine/frontmatter.ts:68-70`). The fallback in `terminalDrain` should mirror this, writing `<failedPath>.tmp` then renaming to `<failedPath>`.
- **`readFile` with ENOENT tolerance** — pattern used at `src/cli.ts:142-146` (the existing rename branch catches `(e as NodeJS.ErrnoException).code !== "ENOENT"`). SPEC step 1 says best-effort body read; reuse the same `code === "ENOENT"` filter and substitute an empty body string.
- **Frontmatter construction inline** — terminalDrain at `src/cli.ts:132-138` already shows the canonical stamp shape: `failed_at: new Date().toISOString()`, optional `failed_step` via conditional spread, `failed_attempts`, `last_cycle_id`. The fallback should produce an equivalent object literal (plus `drain_error`).
- **Event emission ordering** — `src/cli.ts:147-157`: `queue.drain_warning` (only if mutate failed) → `drainFailedTerminal` → `propagateBlocked` → `queue.drained {outcome:"terminal"}` → `issue.failed`. SPEC: preserve order and payloads; the warning continues to fire with `reason: "mutateFrontmatter failed: <message>"`.
- **String-typed forensic field** — `drain_error` value should be `mutateErr.message`. `serializeValue` (`src/engine/frontmatter.ts:42-49`) auto-quotes when `needsQuote` (line 34-40) detects `:`, `"`, `#`, `\n`, leading/trailing whitespace, etc. Error messages typically contain colons, so quoting will be triggered — verify the serializer round-trips by spot-checking.
- **Numeric stamp serialization** — `failed_attempts` is a number; `serializeValue` returns `String(v)`. Existing failed/ files in this repo use `failed_attempts: 1` (unquoted) — matches.

### Dependencies & Integration Points

- `src/engine/frontmatter.ts` — re-exports already imported at `src/cli.ts:20`; this cycle additionally needs `serializeFrontmatter` (currently NOT imported by `cli.ts`). Add it to the existing import.
- `node:fs/promises` — `cli.ts:1` currently imports `readFile, readdir, rename, mkdir`. The fallback needs `writeFile` (new) and reuses `readFile` (already imported) and `rename` (already imported). No new module-level deps.
- `node:path` — `join` already imported (`cli.ts:2`). Used to build `<failedPath>` and the `<failedPath>.tmp` sibling.
- `Logger` plumbing — `log.emit("queue.drain_warning", { cycle_id, issue_id, reason })` at `src/cli.ts:148-152` is already wired; SPEC keeps the reason string-shape identical.
- `runCycle` failure metadata — `failingStep` (passed in as the 7th arg to `terminalDrain`) can be `undefined` if the failure happened outside a named step; the existing happy path uses conditional spread to skip the key. The fallback must preserve that semantics.

### Test Infrastructure

- Test framework: Node native test runner (`node --test`); `npm test` runs `pretest` (esbuild → `dist/cycle.js`) then loads `tests/**/*.test.ts` via `--experimental-strip-types`. See `package.json` scripts.
- Test conventions for queue-drain: integration-style. `bootstrapRepo` (`tests/cli/queue-drain.test.ts:16-36`) creates a tmp git repo with `.cycle/workflows.yml` + scripts and the four `docs/cycle/issues/{raw,todo,done,failed}` directories. `seedTodo` (lines 38-75) writes a well-formed todo + appends a `tbd.jsonl` row. The malformed case at `tests/cli/queue-drain.test.ts:173-215` bypasses `seedTodo` and writes `"body only\n"` directly, then seeds the queue row inline.
- The existing assertion shape (lines 199-211): asserts file presence in `failed/`, queue empty, `queue.drain_warning` event present with `reason: /mutateFrontmatter failed/`. **It does NOT assert any frontmatter fields on the failed/ file.** SPEC's Acceptance Criteria #1 calls for `failed_at`, `failed_step`, `failed_attempts`, `last_cycle_id`, `drain_error` to all be asserted on the failed/ file body, plus the original `"body only\n"` bytes to remain reachable after the frontmatter block.
- Happy-path stamp coverage already exists at `tests/cli/queue-drain.test.ts:139-171` — matches on `/failed_at:/`, `/failed_step: boom/`, `/failed_attempts: 1/`. SPEC requires this test to remain green byte-for-byte.
- Bootstrap helpers reused: `bootstrapRepo`, `seedTodo` patterns are stable across the file's 6 tests.

### Coverage of the change area

`src/cli.ts` is exercised by the queue-drain integration tests above plus several others (`tests/cli/*`). Project-wide coverage floor: line ≥ 95%, branch ≥ 75%, function ≥ 90%. No per-file floor for `src/cli.ts` in `scripts/coverage-gate.mjs` (only `src/engine/triage.ts ≥ 95%`). The fallback branch is currently dead-on-write (happy path tested, malformed path tested only for warning emission + rename, never for body content); adding the stamp assertions exercises the new branch.

## Code References

- `src/cli.ts:120-158` — `terminalDrain` body; the entire scope of the SPEC change lives in lines 130-153 (the try/catch around `mutateFrontmatter` and the conditional `drain_warning` emission).
- `src/cli.ts:289`, `src/cli.ts:381` — the two call sites that pass `(cwd, log, todoPath, failedDir, cycleId, issueId, failingStep, failedAttempts)`; signature must remain untouched.
- `src/cli.ts:20` — existing `parseFrontmatter, mutateFrontmatter` import line; extend to add `serializeFrontmatter`.
- `src/cli.ts:1` — existing `node:fs/promises` import; extend to add `writeFile`.
- `src/engine/frontmatter.ts:60-71` — `mutateFrontmatter` body; canonical model for the atomic tmp-rename pattern the fallback will replicate inline.
- `src/engine/frontmatter.ts:51-58` — `serializeFrontmatter`; pure callable to produce the fallback file body.
- `src/engine/frontmatter.ts:8`, `:21-32` — `FM_RE` and `parseFrontmatter`; documents exactly when mutateFrontmatter throws ("no frontmatter" Error).
- `src/engine/queue.ts:173-177` — `drainFailedTerminal`; unchanged but called after the fallback write.
- `tests/cli/queue-drain.test.ts:173-215` — the malformed-frontmatter test to extend with stamp assertions per SPEC Acceptance #1.
- `tests/cli/queue-drain.test.ts:139-171` — happy-path stamp test that must remain green byte-for-byte.

## Open Questions

- **Field ordering in fallback frontmatter.** `serializeFrontmatter` emits in insertion order; the happy path produces a frontmatter starting with the original keys (via `...fm` spread) then appending stamps. The fallback (when no original frontmatter parsed) has no prior keys, so order will be: `failed_at`, `failed_step?`, `failed_attempts`, `last_cycle_id`, `drain_error`. Acceptable per SPEC ("emit only the failure stamps"), but the plan step should confirm whether the malformed-test should regex on individual stamps (loose) or pin exact ordering (strict).
- **Parsed-but-write-failed branch (Acceptance #3).** SPEC offers a way out: simulate by making the failed/<id>.md.tmp path a directory, or stub the write seam, *or* document the gap in BUILD.md. Plan should pick — fixture-based (preferred for portability across platforms; directory-trap on the tmp sibling is feasible since the path is deterministic) vs. documentation deferral.
- **`drain_error` truncation.** SPEC requires the field to name the cause via `mutateErr.message`. Error messages can be long (e.g., serialized JSON parse trails). The 8192-byte truncation pattern used by reflection.ts is precedent, but SPEC does not call for it here. Plan should confirm no cap is required — the field is one-shot and forensic, not a streaming sink.
- **Re-throw semantics on fallback failure.** SPEC says "if the fallback write itself throws, re-throw to the caller." Today the caller is the main loop (or `runResumeOnce`); a throw here propagates up and trips the engine's existing failure-counter path. Plan should verify no `try/catch` upstream silently swallows.
```
