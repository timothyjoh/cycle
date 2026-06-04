# Research: Cycle 0051

## Cycle Context
SPEC.md asks to extend `allocateCycleId` in `src/engine/cycle-id.ts` so the next cycle id is derived from the **maximum** of (a) the highest `^\d{4}-` directory basename under `docs/cycle/` and (b) the highest `cycle_id` in `.cycle/log.jsonl`, then incremented and zero-padded to 4 digits. Today the function reads the log alone, so on a fresh checkout (committed cycle dirs restored, gitignored log empty) numbering restarts at `0001` and collides with historical directories. The dir scan must be a single bounded `readdir`, regex-matched, fail-safe (a `readdir` error on `docs/cycle/` degrades to the log-derived id; the function never throws), with unit coverage added in `tests/engine/cycle-id.test.ts`.

## Current Codebase State

### Relevant Components
- `allocateCycleId(repoRoot)`: the single allocation function — reads `.cycle/log.jsonl`, parses each non-empty line as JSON, tracks the max numeric `cycle_id`, returns `String(highest + 1).padStart(4, "0")`. — `src/engine/cycle-id.ts:4`
- Log-read fallback: the entire `readFile` is wrapped in `try { … } catch { /* no log yet */ }`, so a missing/unreadable log leaves `highest = 0` ⇒ result `"0001"`. — `src/engine/cycle-id.ts:6`-`16`
- Per-line parse guard: each line is parsed inside its own `try { … } catch { /* skip */ }`; malformed lines and non-string/non-numeric `cycle_id` values (`NaN`) are skipped. — `src/engine/cycle-id.ts:10`-`14`
- Return shape: `String(highest + 1).padStart(4, "0")` — 4-digit zero-padded string. — `src/engine/cycle-id.ts:17`

### Call Sites (integration points — out of scope to modify, but constrain the return contract)
- `src/cli.ts:716` — `const cycleId = row.cycle_id ?? (await allocateCycleId(cwd));` (fresh-pop path; falls back to allocation when the queue row has no id).
- `src/engine/run-cycle.ts:370` — `const cycleId = opts.cycleId ?? (await allocateCycleId(repoRoot));` (runCycle fallback when no explicit id is passed).
- Both callers consume the returned 4-digit string verbatim for `cycle.start.cycle_id`, branch naming, and the `docs/cycle/<cycle_id>-<workflow>-<slug>/` artifact directory. The padded-string contract must be preserved.

### Existing Patterns to Follow
- **`readdir({ withFileTypes: true })` + per-entry filter**: established convention for cheap, non-recursive directory enumeration. `triage.ts` uses `(await readdir(dir, { withFileTypes: true }))`; `walkthrough.ts:153` and `reflection.ts:265` use `readdir(mediaDir, { withFileTypes: true })`. Entries are filtered via `.isFile()` / `.isDirectory()`. — `src/engine/triage.ts:362`, `src/engine/walkthrough.ts:153`, `src/engine/reflection.ts:265`
- **ENOENT-degrade-to-empty on `readdir`**: `collectWalkthroughMedia` wraps `readdir` in `try { … } catch (err) { if (err.code === "ENOENT") return []; throw err; }` — the canonical fail-safe directory-read shape. The SPEC's required behavior is the broader form (any error ⇒ "no directory contribution", `highestDir = 0`). — `src/engine/walkthrough.ts:151`-`157`
- **Imports**: the module imports only `{ readFile }` from `node:fs/promises` and `{ join }` from `node:path`. The peer modules import `readdir` alongside other fs/promises members. — `src/engine/cycle-id.ts:1`-`2`
- **Defensive parse / fail-closed numeric extraction**: `typeof e.cycle_id === "string" ? parseInt(e.cycle_id, 10) : NaN` then `!Number.isNaN(id)` guard — the existing idiom for turning untrusted text into a bounded integer; the new dir-basename regex extraction should mirror this (`^(\d{4})-` capture → `parseInt` → `NaN`/range guard). — `src/engine/cycle-id.ts:12`-`13`
- **Failure handling**: all error handling in this module is local swallow-and-degrade — no logging, no events, no rethrow. The new dir-scan boundary must follow the same pattern (catch at the scan boundary, contribute `0`, let the overall allocation complete). The function emits **no** structured events and has no observability surface — it is a pure helper returning a string. There are no locks/dedup/guards inside it; idempotency is irrelevant (read-only allocation).
- **Observability**: none in this module. Cycle-id allocation is silent; the allocated id first appears in the log via the `cycle.start` event written by the caller, not here.

### Dependencies & Integration Points
- `node:fs/promises` — `readFile` (present); `readdir` would be added (already used across `src/engine/`). — `src/engine/cycle-id.ts:1`
- `node:path` — `join`. — `src/engine/cycle-id.ts:2`
- `docs/cycle/` layout: 258 committed `NNNN-<workflow>-<slug>` directories, highest `0258`; non-matching siblings are `docs/cycle/issues/` and `docs/cycle/reports/` (both must be ignored by the `^\d{4}-` regex). Confirmed via directory listing. — `docs/cycle/`
- `.cycle/log.jsonl` — runtime, gitignored; current max `cycle_id` on this machine is `0050`.

### Test Infrastructure
- **Framework**: `node:test` (`test` + `node:assert/strict`). — `tests/engine/cycle-id.test.ts:1`-`2`
- **Conventions**: real temp directories via `mkdtemp(join(tmpdir(), "cycle-test-"))`, populated with `mkdir(..., { recursive: true })` / `writeFile`, torn down in a `finally` with `rm(root, { recursive: true, force: true })`. No mocking of fs — consistent with the repo rule that `node:fs/promises` cannot be stubbed via `mock.method` (CLAUDE.md, Test conventions). — `tests/engine/cycle-id.test.ts:8`-`31`
- **Existing tests** (2): "starts at 0001 when log is empty" (creates `.cycle/`, no log → `"0001"`); "returns highest+1 from log.jsonl" (writes two `cycle.start` lines `0042`/`0007` → `"0043"`). — `tests/engine/cycle-id.test.ts:8`,`18`
- **Failure-path coverage today**: the empty-log path is exercised (test 1). No test seeds `docs/cycle/` dirs, no test exercises a `readdir` failure, no test exercises the dir-dominant or both-empty paths — these are the gaps the SPEC's testing strategy fills.
- **Coverage floors**: `src/engine/cycle-id.ts` is **not** currently in the `FLOORS` table in `scripts/coverage-gate.mjs:12`-`44` (peer engine helpers like `path-utils.ts`, `log-fmt.ts`, `rate-limit.ts` are pinned at `100`). If a per-file floor is added for this module, it must be registered there and recorded in the CLAUDE.md Coverage policy table (per SPEC Documentation Updates).

## Code References
- `src/engine/cycle-id.ts:4`-`18` — `allocateCycleId` full implementation (log-only derivation, the change target).
- `src/engine/cycle-id.ts:6`-`16` — log `readFile` wrapped in degrade-to-`highest=0` `try/catch`.
- `src/engine/cycle-id.ts:12`-`13` — defensive string→int extraction idiom to mirror for dir basenames.
- `src/engine/cycle-id.ts:17` — `String(highest + 1).padStart(4, "0")` return contract.
- `src/engine/walkthrough.ts:151`-`157` — canonical `readdir` ENOENT-degrade pattern.
- `src/engine/triage.ts:362` / `reflection.ts:265` — `readdir({ withFileTypes: true })` enumeration idiom.
- `src/cli.ts:716`, `src/engine/run-cycle.ts:370` — the two `allocateCycleId` call sites consuming the padded string.
- `tests/engine/cycle-id.test.ts:8`-`31` — existing temp-dir test pattern to extend.
- `scripts/coverage-gate.mjs:12`-`44` — `FLOORS` table (no `cycle-id.ts` entry today).

## Open Questions
- Whether to add a per-file coverage floor for `src/engine/cycle-id.ts` to `FLOORS` (and CLAUDE.md) as part of this cycle, or leave it under the aggregate thresholds only — the SPEC frames the floor as conditional ("if … the module gains a documented per-file coverage floor"). The plan step should decide.
- Whether `highestDir` extraction should accept exactly 4-digit prefixes (`^(\d{4})-`, matching the SPEC requirement and the committed layout) or any leading digit run — the SPEC requirement text pins `^(\d{4})-`, so a 5+-digit or non-hyphen-delimited basename would be ignored; confirm no future >9999 numbering concern is in scope (it is not, per Out of Scope).
