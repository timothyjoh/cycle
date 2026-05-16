# Research: Cycle 0096

## Cycle Context
Add a cross-run dedup gate inside `ingestReflection` that reads `docs/cycle/issues/todo/` and `docs/cycle/issues/blocked/` before the per-entry write loop, normalizes both the existing filenames and each candidate `sharp_edges` title, and suppresses any candidate whose normalized slug is a substring of any normalized filename in the combined set. Suppressed entries emit `reflection.skipped { reason: "dedup", … }` instead of `reflection.surfaced`; ENOENT on either directory is treated as empty (no warning); other `readdir` errors fail-open with a `reflection.warning`; `reflection.summary` gains a `suppressed_count` field when any entries were suppressed.

## Current Codebase State

### Relevant Components

- **`ingestReflection` function** — `src/engine/reflection.ts:14` — the sole entry point for processing a cycle's reflection stdout. Takes `(repoRoot, cycleId, _cycleSlug, stdout, log)`. Returns `IngestResult = { written: string[]; skipped: number }`. The per-entry write loop runs lines 73–118; `reflection.summary` emits at line 120–124.

- **`readdir` import** — `src/engine/reflection.ts:1` — already imported from `"node:fs/promises"` alongside `mkdir`, `rename`, `unlink`, `writeFile`. No new imports needed for `readdir`.

- **`rawDir` variable** — `src/engine/reflection.ts:21` — `join(repoRoot, "docs/cycle/issues/raw")`. The planner must derive parallel paths for `todo/` and `blocked/` using the same `join(repoRoot, "docs/cycle/issues/todo")` / `join(repoRoot, "docs/cycle/issues/blocked")` pattern.

- **Existing in-pass dedup** — `src/engine/reflection.ts:70` — `usedSlugs: Set<string>` prevents within-run slug collisions. The new cross-run dedup must run **before** this loop (SPEC §Requirements: "new dedup gate runs before the existing in-cycle dedup").

- **`slugify` helper** — `src/issue/id.ts:1–8` — `text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)`. SPEC specifies the candidate title normalization as `.slice(0, 60)` (not 40), so the planner must **inline** the normalization rather than calling `slugify` directly.

- **Filename normalization** — SPEC defines it as: strip `.md`, lowercase, `replace(/[^a-z0-9]+/g, "-")`, trim leading/trailing `-`. This is effectively `slugify` without the length cap — planners should NOT reuse `slugify` for filenames either, since `slugify` caps at 40 chars but filenames can be longer.

- **`reflection.summary` emission** — `src/engine/reflection.ts:120–124` — currently emits `{ cycle_id, count: written.length, skipped }`. SPEC requires adding `suppressed_count` (as a number) when ≥ 1 entry was suppressed. The `skipped` field reflects `invalid_entry` skips; a new `suppressed` counter is needed alongside `written`.

- **`IngestResult` type** — `src/engine/reflection.ts:8` — `{ written: string[]; skipped: number }`. Does NOT need to change (suppressed count surfaces via log event only, not return value).

- **`atomicWrite` helper** — `src/engine/reflection.ts:228–242` — used for every file write; the new gate inserts before the write call at line 110.

- **`Logger` type** — `src/engine/log.ts:4` — `{ emit: (event: string, fields: Record<string, unknown>) => Promise<void> }`. The test mock in `reflection.test.ts:11–20` implements the same shape.

### Existing Patterns to Follow

- **ENOENT-tolerant `readdir`**: No existing example in `reflection.ts`, but the pattern expected by SPEC is try/catch on `readdir`, check `(e as NodeJS.ErrnoException).code === "ENOENT"` → return empty array; rethrow otherwise with a `log.emit("reflection.warning", …)` and `continue`/skip-for-that-dir.

- **`try { … } catch { // best-effort }` swallowing** — `src/engine/reflection.ts:28–33` — used for best-effort `unlink`. The dedup `readdir` errors should NOT silently swallow; they must emit `reflection.warning` and fail-open.

- **Event field shapes**: All existing `reflection.*` events use `{ cycle_id, … }` as first field (lines 43, 48, 58, 77, 112, 121). New `reflection.skipped { reason: "dedup", … }` and `reflection.warning { reason: "dedup_read_error", … }` must follow this pattern.

- **`join(repoRoot, …)` path construction** — `src/engine/reflection.ts:21–22` — all paths built with `join(repoRoot, "docs/cycle/issues/<subdir>")`.

- **Repo-relative `matched_file`** — SPEC requires `matched_file` to be a repo-relative path like `"docs/cycle/issues/todo/<filename>.md"`. Since `readdir` returns bare filenames, the planner must reconstruct the relative path as `join("docs/cycle/issues/todo", filename)` (POSIX-style). Note: `join` from `"node:path"` is already imported.

### Dependencies & Integration Points

- `src/engine/reflection.ts` — only file to edit.
- `tests/engine/reflection.test.ts` — existing test file to extend (SPEC: do not create a new file). Currently 24 test cases (lines 42–589). All new tests added after line 589.
- `CLAUDE.md` — `## Architecture quick reference` → "Reflection step" paragraph — must be updated to mention the new dedup gate (SPEC §Documentation Updates).

### Test Infrastructure

- **Framework**: Node native test runner (`node:test`), `strict as assert` from `"node:assert"`.
- **Test helper `makeLogger`** — `tests/engine/reflection.test.ts:11–21` — returns `{ events: EmittedEvent[], logger }` where logger collects all emitted events into the array. Tests assert on `events.find(e => e.event === "reflection.skipped")` etc.
- **Test helper `setupRepo`** — `tests/engine/reflection.test.ts:23–28` — creates a `mkdtemp` dir with `.cycle/` and `docs/cycle/issues/raw/` subdirectories. For the new tests, callers must additionally `mkdir` the `todo/` and/or `blocked/` subdirs as needed.
- **`fileExists` helper** — `tests/engine/reflection.test.ts:30–37` — `stat`-based boolean check.
- **`rm(root, { recursive: true, force: true })` cleanup** — used in every test's `finally` block.
- **Imports already in test file** — `mkdtemp`, `mkdir`, `writeFile`, `readFile`, `readdir`, `rm`, `stat` from `"node:fs/promises"`. All needed for new tests are already imported.
- **Coverage of change area**: `src/engine/reflection.ts` has no per-file floor in `scripts/coverage-gate.mjs` (floor is only on `src/engine/triage.ts`), but global line ≥ 95% / branch ≥ 75% / function ≥ 90% applies.

## Code References

- `src/engine/reflection.ts:1` — imports: `mkdir, readdir, rename, unlink, writeFile` from `"node:fs/promises"`; `dirname, join` from `"node:path"`.
- `src/engine/reflection.ts:8` — `IngestResult = { written: string[]; skipped: number }` (return type; unchanged by this cycle).
- `src/engine/reflection.ts:14–127` — full `ingestReflection` function body.
- `src/engine/reflection.ts:21` — `rawDir` construction pattern for sibling dir paths.
- `src/engine/reflection.ts:66–127` — entries loop + summary emit; new dedup gate inserts between the `entries` variable initialization (line 66) and the `for` loop (line 73).
- `src/engine/reflection.ts:69` — `skipped` counter; a parallel `suppressed` counter must be added nearby.
- `src/engine/reflection.ts:120–124` — `reflection.summary` emit; gains `suppressed_count` field when `suppressed > 0`.
- `src/issue/id.ts:1–8` — `slugify`: caps at 40; SPEC requires title normalization caps at 60 — must inline, not call `slugify`.
- `tests/engine/reflection.test.ts:23–28` — `setupRepo` helper; new tests that need `todo/`/`blocked/` must `mkdir` those subdirs after calling `setupRepo`.
- `tests/engine/reflection.test.ts:11–21` — `makeLogger` helper; usable as-is in all new tests.

## Open Questions

- The SPEC says `matched_file` must be repo-relative (e.g., `docs/cycle/issues/todo/<filename>.md`). On Windows `join` uses backslashes. Current codebase targets macOS/Linux; the planner should decide whether to use a POSIX join or string concatenation for the relative path. All existing `join` calls in this file use `node:path`'s `join` without POSIX forcing — planner should follow suit and note this is a Darwin-only concern per the environment.
- The SPEC says the new gate runs "before the existing in-cycle dedup (log.jsonl check)." Looking at the current code, there is no log.jsonl scan inside `ingestReflection` — the in-pass `usedSlugs` set is the only existing dedup. The "in-cycle dedup" referenced in the SPEC appears to mean the `usedSlugs` slug-collision guard. The planner should confirm whether "before the existing in-cycle dedup" means before the `usedSlugs` check or before the entire write loop.
