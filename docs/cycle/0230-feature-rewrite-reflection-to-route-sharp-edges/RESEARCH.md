# Research: Cycle 0230

## Cycle Context

Cycle 0230 rewrites `src/engine/reflection.ts` and its prompt to implement three-bucket routing for sharp edges: `fix_now` items (in-footprint mechanical fixes) go to `FINAL_FIXES.md` in the artifact dir for the `final_fix` step to consume; `defer` items become `raw/` issues with a `priority` enum value; `discuss` items become `raw/` issues with `priority: discuss`. The rewrite also enforces a 1–2 deferred-issue cap per cycle, deduplicates candidates against existing `raw/`/`todo/`/`discuss/` files, integrates `commit.scope_warning` log events into deferred cleanup issues, writes a `REFLECTION.md` narrative artifact, and eliminates all `priority_hint` numeric fields from the reflection output and frontmatter.

---

## Current Codebase State

### Relevant Components

- **Reflection ingestion function** — `src/engine/reflection.ts:15–128`
  - Signature: `ingestReflection(repoRoot, cycleId, _cycleSlug, stdout, log)`
  - No `touchedJsonPath` or `artifactDir` parameter; does not read `touched.json`
  - Deletes prior `refl-<cycleId>-*.md` from `raw/` on each run (idempotent resume)
  - Iterates `sharp_edges`, validates each, writes one `raw/` file per entry
  - Emits `reflection.surfaced` per written entry (includes `priority_hint` field), then `reflection.summary`
  - Returns `{ written: string[], skipped: number }`

- **`SharpEdge` type** — `src/engine/reflection.ts:8`
  - `{ title: string; body: string; priority_hint: number }`
  - No `bucket` field

- **`validateEntry`** — `src/engine/reflection.ts:225–231`
  - Requires `priority_hint` to be a finite number; rejects strings/null
  - Field name `"priority_hint"` used in skip event payload

- **`writeParseError`** — `src/engine/reflection.ts:206–223`
  - Writes `refl-<cycleId>-parse-error.md` to `raw/` on parse failure
  - Frontmatter includes `priority_hint: 7` (hardcoded numeric)

- **`parseWithRepair`** — `src/engine/reflection.ts:132–148`
  - Calls `stripFences(s)` first (from `log-fmt.ts`), then attempts `JSON.parse`
  - On failure: retries via `trimToLastBalancedClose` with offset-based loop
  - Returns `{ ok: true; value: unknown }` or `{ ok: false; message: string }`

- **`atomicWrite`** — `src/engine/reflection.ts:233–247`
  - Writes via `.tmp` + rename; cleans up temp on rename failure
  - Private to `reflection.ts`

- **`ingestReflection` call site** — `src/engine/run-cycle.ts:382–384`
  ```ts
  if (r.status === "ok" && step.name === "reflection") {
    await ingestReflection(repoRoot, cycleId, slug, r.stdout, log);
  }
  ```
  - `artifactDir` is in scope at this point (`src/engine/run-cycle.ts:208–229`)
  - `cycleEnv` with `CYCLE_ID` etc. is also in scope

- **`accumulateTouchedFiles`** — `src/engine/run-cycle.ts:102–127`
  - Writes `touched.json` to `join(artifactDir, "touched.json")`
  - Format: `{ files: string[] }` (sorted, deduped)
  - Called after successful `build`, `fix`, or `final_fix` steps (`RESET_ELIGIBLE_STEPS`)

- **`touched.json` read in `commitCycle`** — `src/engine/commit-cycle.ts:140–150`
  - Locates artifact dir by scanning `docs/cycle/` for `<cycleId>-*` entry
  - Reads `touched.json`, populates `touchedFiles: Set<string>`

- **`commit.scope_warning` event** — `src/engine/commit-cycle.ts:170`
  - Emitted to global `.cycle/log.jsonl` (not a sidecar file in artifact dir)
  - Payload: `{ cycle_id, files: string[] }` — lists `src/`+`scripts/` files committed but absent from `touched.json`
  - There is no per-cycle log file; all events append to `.cycle/log.jsonl`

- **`Priority` type** — `src/engine/queue.ts:6`
  - `"low" | "medium" | "high" | "critical" | "discuss"`
  - `PRIORITY_ORDER`: critical=0, high=1, medium=2, low=3, discuss=4
  - `normalizePriority(raw)` — `src/engine/queue.ts:12–13` accepts string enum values directly; also converts numeric hints (≥7→critical, ≥5→high, ≥3→medium, else→low)

- **`discuss/` folder and `parkForDiscussion`** — `src/engine/triage.ts:707–727`
  - `docs/cycle/issues/discuss/` created lazily by `mkdir({ recursive: true })`
  - `rename(raw.srcPath, destPath)` — moves from `raw/` to `discuss/`
  - Emits `issue.parked_for_discussion { id, priority: "discuss", path }`

- **Reflection prompt** — `src/defaults/prompts/reflection.md`
  - Elicits `{ sharp_edges: [{ title, body, priority_hint }] }`
  - Uses numeric `priority_hint` 1–10 scale
  - No `bucket` field in current output contract

- **`final_fix` step in workflows.yml** — `src/defaults/workflows.yml:28`
  - `{ name: final_fix, agent: claudecode, prompt: prompts/final_fix.md, skip_unless: FINAL_FIXES.md }`
  - `skip_unless` gate: engine checks `join(artifactDir, "FINAL_FIXES.md")` for file existence before running step — `src/engine/run-cycle.ts:263–281`
  - `final_fix` is in `RESET_ELIGIBLE_STEPS` and `ARTIFACT_STEPS` — `src/engine/run-cycle.ts:27,35`

- **`serializeFrontmatter` / `parseFrontmatter`** — `src/engine/frontmatter.ts:51–58` / `:21–32`
  - `serializeFrontmatter(fm: Frontmatter, bodyAfter: string): string`
  - `Frontmatter = Record<string, string | number | string[]>`
  - Handles quoting for values with special chars (`:`, `"`, `#`, leading/trailing spaces, bare integers)

- **`slugify`** — `src/issue/id.ts:1–8`
  - Lowercases, replaces `[^a-z0-9]+` with `-`, strips leading/trailing `-`, truncates to 40 chars
  - Empty result is caller's responsibility to handle (current code falls back to `"entry"`)

- **`Logger` type** — `src/engine/log.ts:4–6`
  - `{ emit: (event: string, fields: Record<string, unknown>) => Promise<void> }`
  - Single global file: `join(repoRoot, ".cycle", "log.jsonl")`

- **`stripFences`** — `src/engine/log-fmt.ts` (imported by reflection.ts)
  - Removes markdown fence wrappers before JSON parse

---

### Existing Patterns to Follow

- **Raw issue frontmatter shape** (established by triage and existing reflection): fields include `id`, `source`, `title`, `added_at`, `triage_attempts: 0`, `priority_hint`, `origin_cycle_id`. The new shape must replace `priority_hint` with `priority` (string enum) — `src/engine/reflection.ts:99–110`.

- **Atomic write pattern** — `src/engine/reflection.ts:233–247`: write to `.tmp`, rename. Reuse for all new file writes (`FINAL_FIXES.md`, `REFLECTION.md`, deferred raw issues).

- **`mkdir({ recursive: true })` before writes** — used throughout `reflection.ts`, `triage.ts`, and `commit-cycle.ts`. Must be called before writing to `raw/`, `discuss/`, and artifact dir.

- **Idempotent cleanup at start of `ingestReflection`** — `src/engine/reflection.ts:25–35`: delete all prior `refl-<cycleId>-*.md` from `raw/` before re-running. Dedup logic must account for files written in the *current* run (tracked in-memory via `usedSlugs`) vs. files pre-existing in `raw/`/`todo/`/`discuss/` from *prior* runs or cycles.

- **Log event pattern**: all events use `{ ts: ISO, event: "...", ...fields }` appended to `.cycle/log.jsonl` via the injected `Logger`. No direct `appendFile` in `reflection.ts`; always use `log.emit(...)`.

- **`expectExactlyOne` helper** — `tests/helpers.ts`: used in reflection tests for events that must fire exactly once (`reflection.summary`). All new exactly-once events should use this helper.

- **Test setup pattern** — `tests/engine/reflection.test.ts:24–29`: `mkdtemp`, `mkdir .cycle`, `mkdir docs/cycle/issues/raw`, return `root`. Tests that need `todo/` or `discuss/` dirs will need `setupRepo` extended or inline `mkdir`.

- **`parseFrontmatter` round-trip in tests** — existing tests read back the written `.md` file and use `parseFrontmatter` to assert frontmatter fields, then `bodyAfter` for body content. New tests should follow the same pattern.

- **Coverage floor not yet registered** — `src/engine/reflection.ts` does not appear in the `FLOORS` table in `scripts/coverage-gate.mjs:12–29`. The SPEC requires ≥95% line coverage; the floor must be added.

- **`normalizePriority` for numeric-to-enum conversion** — `src/engine/queue.ts:12–17` provides the bridge if needed for backward compat in the parse-error fallback path.

---

### Dependencies & Integration Points

- **`touched.json` path** — `join(artifactDir, "touched.json")`, written by `accumulateTouchedFiles` in `run-cycle.ts`. At reflection time (after successful `reflection` step), `touched.json` will exist if `build` or `fix` succeeded earlier in the same cycle. May be absent if only pre-build steps ran.

- **`commit.scope_warning` source** — Currently a log event in `.cycle/log.jsonl` only. No sidecar file in `artifactDir`. To read these events in `ingestReflection`, the implementation must scan `.cycle/log.jsonl` for `commit.scope_warning` events with matching `cycle_id`. Alternatively, the planner may choose to write a sidecar file during `commitCycle` — but that would require changes to `commit-cycle.ts`, which the SPEC does not list in scope.

- **`final_fix` step gate** — `run-cycle.ts:263–268` checks `stat(join(artifactDir, step.skip_unless))`. `ingestReflection` must write `FINAL_FIXES.md` to `artifactDir` (not `raw/`) for the gate to fire.

- **Dedup scan directories** — SPEC requires checking `raw/`, `todo/`, and `discuss/`. Paths:
  - `raw/`: `join(repoRoot, "docs/cycle/issues/raw")`
  - `todo/`: `join(repoRoot, "docs/cycle/issues/todo")`
  - `discuss/`: `join(repoRoot, "docs/cycle/issues/discuss")`

- **`FINAL_FIXES.md` consumer** — `src/defaults/prompts/final_fix.md:12–17`: the `final_fix` step reads `FINAL_FIXES.md` as its task list and uses `touched.json` to constrain edits to the cycle footprint.

- **`artifactDir` at call site** — available in `run-cycle.ts` scope at line 383; `ingestReflection` call must be updated to pass it.

---

### Test Infrastructure

- **Framework**: Node built-in `node:test` with `node:assert/strict`
- **Test file**: `tests/engine/reflection.test.ts` — 26 tests as of the last count (prior observation 1137 noted 24; cycles 0208–0209 added 2 more)
- **Helpers**: `tests/helpers.ts` — provides `expectExactlyOne(events, eventName)`
- **Temp dir pattern**: `mkdtemp(join(tmpdir(), "cycle-refl-"))` with `finally { rm(root, ...) }`
- **Logger mock**: inline `makeLogger()` factory returning `{ events: EmittedEvent[], logger }` — `tests/engine/reflection.test.ts:12–19`
- **File existence helper**: `fileExists(p)` using `stat` — `tests/engine/reflection.test.ts:31–37`
- **Current coverage of `reflection.ts`**: no per-file floor registered in `coverage-gate.mjs`; aggregate metrics showed ≥95% historically but the floor is not enforced per-file

---

## Code References

- `src/engine/reflection.ts:8` — `SharpEdge` type with `priority_hint: number`
- `src/engine/reflection.ts:15–21` — `ingestReflection` current signature (5 params, no `artifactDir`)
- `src/engine/reflection.ts:25–35` — idempotent cleanup of prior `refl-<cycleId>-*.md`
- `src/engine/reflection.ts:67–119` — main write loop: slug, id, frontmatter, `atomicWrite`, `reflection.surfaced` event
- `src/engine/reflection.ts:99–110` — `serializeFrontmatter` call with `priority_hint` in frontmatter
- `src/engine/reflection.ts:113–118` — `reflection.surfaced` event emitted with `priority_hint` field
- `src/engine/reflection.ts:121–127` — `reflection.summary` event (keep as-is; used by `expectExactlyOne` in tests)
- `src/engine/reflection.ts:132–148` — `parseWithRepair` with `stripFences` + retry loop
- `src/engine/reflection.ts:206–223` — `writeParseError` with hardcoded `priority_hint: 7`
- `src/engine/reflection.ts:225–231` — `validateEntry` requiring finite-number `priority_hint`
- `src/engine/reflection.ts:233–247` — `atomicWrite` helper (private, reuse pattern for new writes)
- `src/engine/run-cycle.ts:27` — `RESET_ELIGIBLE_STEPS = new Set(["build", "fix", "final_fix"])`
- `src/engine/run-cycle.ts:35` — `ARTIFACT_STEPS` includes `final_fix`
- `src/engine/run-cycle.ts:102–127` — `accumulateTouchedFiles` writes `touched.json` to `artifactDir`
- `src/engine/run-cycle.ts:263–281` — `skip_unless` gate: checks artifact file presence before step runs
- `src/engine/run-cycle.ts:382–384` — `ingestReflection` call site; `artifactDir` in scope
- `src/engine/run-cycle.ts:390–394` — `accumulateTouchedFiles` called after `RESET_ELIGIBLE_STEPS` succeed
- `src/engine/commit-cycle.ts:140–150` — reads `touched.json` from artifact dir by scanning `docs/cycle/`
- `src/engine/commit-cycle.ts:166–171` — emits `commit.scope_warning { cycle_id, files }` to global log
- `src/engine/queue.ts:6` — `Priority` type: `"low" | "medium" | "high" | "critical" | "discuss"`
- `src/engine/queue.ts:8–10` — `PRIORITY_ORDER` for ordering
- `src/engine/queue.ts:12–17` — `normalizePriority` converts numeric hints to enum strings
- `src/engine/frontmatter.ts:3` — `FrontmatterValue = string | number | string[]`
- `src/engine/frontmatter.ts:51–58` — `serializeFrontmatter(fm, bodyAfter)`
- `src/engine/log.ts:8–18` — `createLogger`: single global `.cycle/log.jsonl` append-only
- `src/issue/id.ts:1–8` — `slugify`: 40-char limit, kebab
- `src/defaults/prompts/reflection.md:52–64` — current output contract with `priority_hint` field
- `src/defaults/workflows.yml:27–29` — `reflection` + `final_fix` + `final_verify` step ordering
- `scripts/coverage-gate.mjs:12–29` — `FLOORS` table; `reflection.ts` not yet present
- `tests/engine/reflection.test.ts:12–19` — `makeLogger` mock factory
- `tests/engine/reflection.test.ts:24–29` — `setupRepo` creates `raw/` dir only
- `tests/engine/reflection.test.ts:43–84` — happy-path test asserting `priority_hint` in frontmatter (will need update)
- `tests/engine/reflection.test.ts:383–400` — test asserting `priority_hint` string rejected (field name changes)

---

## Open Questions

1. **`commit.scope_warning` access**: The event is only in `.cycle/log.jsonl`, not in a sidecar in `artifactDir`. How should `ingestReflection` read these events — by scanning the global log for matching `cycle_id`, or by having `commitCycle` write a sidecar (e.g., `scope_warning.json`) to `artifactDir`? The SPEC says "from the cycle artifact dir log or a sidecar file" but does not mandate which approach. Scanning `log.jsonl` by `cycle_id` requires no changes to `commit-cycle.ts` but adds I/O and coupling to log format. A sidecar avoids log parsing but requires a `commit-cycle.ts` change outside this SPEC's listed files.

2. **`REFLECTION.md` write path**: The SPEC says write to the artifact dir. At the `ingestReflection` call site, `artifactDir` is in scope. The function must receive it as a parameter to write `REFLECTION.md` and `FINAL_FIXES.md` there. The `writeParseError` path also currently writes to `raw/` — should it still do so when parsing fails, or should the parse-error escalation also write a `REFLECTION.md` (even empty)?

3. **Idempotent cleanup scope**: Current code deletes all prior `refl-<cycleId>-*.md` from `raw/` on each run. With three-bucket routing, some files from a previous run may be in `todo/` or `discuss/` (if triage ran between reflection runs). Should the idempotent cleanup extend to those folders, or only to `raw/`? The SPEC dedup logic checks `todo/`/`discuss/` but does not mention cleaning them on re-run.

4. **Cap count**: The SPEC says "at most 1–2 deferred raw issues per cycle" (issue file says "1-2", SPEC requirements say "at most 2 combined defer+discuss"). The SPEC acceptance criteria says cap=2. What is the exact cap integer: 1, 2, or is it configurable?

5. **`priority_hint` in `writeParseError`**: The fallback parse-error path at `src/engine/reflection.ts:206–223` currently writes `priority_hint: 7`. The SPEC requires removing all `priority_hint` emission. Should the parse-error frontmatter use a `priority` enum (e.g., `"high"`) instead, or omit priority entirely?

6. **`validateEntry` field name**: Current validation rejects entries missing `priority_hint`. New validation must accept `bucket` + conditional `priority`. What is the exact validation rule for entries with `bucket: "fix_now"` (which have no `priority`) vs. `defer`/`discuss` (which need a valid enum string)?
