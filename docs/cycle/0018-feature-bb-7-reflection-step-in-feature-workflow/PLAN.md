Have enough context. Now writing PLAN to stdout.

---

# Implementation Plan: Cycle 0018

## Overview
Add a terminal `reflection` step to the `feature` workflow that emits a JSON `sharp_edges[]` payload, and a deterministic engine ingestor that materializes each entry as a `source: reflection` raw issue so the next triage pass front-of-queues self-healing work. Parse / exec failures are non-fatal — cycle ends ok.

## Current State (from Research)
- `src/engine/run-cycle.ts:62-81` runs `wf.steps` sequentially, writes claudecode stdout to `<artifactDir>/<STEP_NAME>.md`, and returns `failed` on any step `r.status === "failed"`. `cycle.end` emits after the loop.
- `src/defaults/workflows.yml:10-23` `feature` workflow currently ends at `pr`.
- `src/issue/materialize.ts:5-24` is the existing raw-file write pattern (frontmatter + body, recursive mkdir).
- `src/issue/id.ts:1-8` `slugify` lower-snakes, truncates 40 chars, strips trailing dashes — reused unchanged.
- `src/engine/frontmatter.ts:50-57` `serializeFrontmatter` properly escapes values; `triage.ts:505-519` `atomicWrite` is the tmp-rename template.
- `src/engine/blocked.ts:10-73` is the closest analog: deterministic module, atomic mutations, emits one event per artifact + one summary event.
- `src/engine/triage.ts:207-225` `loadRaws` reads any `*.md`, only requires `id`. Reflection-sourced raws flow through unchanged. `priority_hint` rides as frontmatter and is surfaced verbatim to triage agent (no consumer logic).
- `src/cli.ts:88-95, 313-322` rescans `rawHasFiles()` between cycles and runs triage — no CLI change needed.

## Desired End State
- `feature` workflow has `reflection` as final step (after `pr`).
- `src/defaults/prompts/reflection.md` exists; `npm run sync-defaults` propagated both into `.cycle/`.
- New `src/engine/reflection.ts` exports `ingestReflection(repoRoot, cycleId, slug, stdout, log)` returning `{written: string[], skipped: number}`.
- `run-cycle.ts` calls `ingestReflection` after the `reflection` step's stdout is captured, BEFORE `cycle.end`. A failing reflection step (`r.status === "failed"`) emits `reflection.skipped {reason: "exec_failed"}` and falls through to `cycle.end status: ok` — it does NOT return early as failed.
- `cycle.end status: ok` remains terminal; `reflection.summary` precedes it.
- Coverage ≥ master baseline (line 95, branch 75, function 90). Typecheck clean. All tests pass.

## What We're NOT Doing
- No reflection in `bug` / `research` workflows.
- No triage-side handling of `priority_hint` (recorded only).
- No retroactive reflection on past cycles.
- No clamping / range-validation of `priority_hint` beyond "is a number" (out-of-range accepted as-is — matches SPEC line 32 + acceptance criteria).
- No new event taxonomy beyond `reflection.skipped` / `reflection.surfaced` / `reflection.summary`. Per-entry drops reuse `reflection.skipped` with a distinct `reason` ("invalid_entry") and an `entry_index` field — avoids inventing a fourth event.
- No change to CLI loop, `runTriage`, or queue primitives.

## Implementation Approach

### Open Question Resolutions
- **Non-fatal step semantics (RESEARCH Q1):** special-case the step name `reflection` inside the step loop. When `r.status === "failed"` AND `step.name === "reflection"`, emit `reflection.skipped {reason: "exec_failed", cycle_id}` and `continue` (loop ends naturally; `cycle.end status: ok` emits below).
- **`reflection.skipped` taxonomy (RESEARCH Q2):** single event, three reasons — `"exec_failed"` (step exit non-zero), `"parse_error"` (stdout not JSON or schema mismatch at the root), `"invalid_entry"` (per-entry drop; carries `entry_index` + `field`).
- **Idempotent unlink scope (RESEARCH Q3):** `readdir(rawDir)` and unlink every file matching `^refl-<cycleId>-.+\.md$` before writing the new batch. Cycle-scoped, slug-agnostic.
- **Slug collision suffix (RESEARCH Q4):** in-pass only. Cross-run collision is already resolved by the unlink in Q3. Maintain a `Set<string>` of slugs used in this pass; on collision, append `-2`, `-3`, … until unique.
- **Where ingestion is invoked (RESEARCH Q5):** hardcoded check on `step.name === "reflection"` inside the step loop in `run-cycle.ts`. Couples engine to the step name "reflection" — accepted because the prompt path and workflow position are also conventions in `src/defaults/`; an alternative `step.kind: "reflection"` field is unnecessary YAGNI right now.
- **Resume edge (RESEARCH Q6):** documented inline in `reflection.ts` as a comment — "unlink is best-effort cycle-scoped; previously-triaged raws already moved out of `raw/` will not be removed and may yield duplicate-titled raws on resume re-run. Acceptable per SPEC."
- **`priority_hint` range (RESEARCH Q7):** accept any finite `number`. No clamp, no drop. (NaN / non-finite → invalid entry.)

### Ordering Inside `run-cycle.ts`
Insert a post-step hook after the existing `if (r.status === "ok" && step.name)` artifact write. The hook fires when `step.name === "reflection" && r.status === "ok"` and awaits `ingestReflection(repoRoot, cycleId, slug, r.stdout, log)`. The `r.status === "failed"` branch checks `step.name === "reflection"` before the failed-return: if reflection, emit `reflection.skipped {reason: "exec_failed"}` and `continue`; otherwise existing failed-return is preserved.

---

## Task 1: Author the reflection prompt

### Overview
New default prompt that instructs the agent to read cycle artifacts + `git diff` and emit JSON-only stdout matching `{sharp_edges: [{title, body, priority_hint}]}`. Mirrors `prompts/triage.md`'s JSON-only discipline.

### Changes Required
**File**: `src/defaults/prompts/reflection.md` (new)

Outline (single prompt, ~40-60 lines):
- Header: "You are the reflection step of the cycle engine. Your job is to surface sharp edges as JSON."
- Inputs to read: `SPEC.md`, `RESEARCH.md`, `PLAN.md`, `BUILD.md`, `REVIEW.md`, `MUST-FIX.md` (if present), `FIX.md` (if present) — paths relative to the current working directory (artifact dir is the cwd).
- Inspect `git diff "${CYCLE_BASE}"...HEAD` and `tail -n 200 .cycle/log.jsonl`.
- "Sharp edges" definition: workarounds taken under time pressure, deferred follow-ups, design smells, undertested code paths, leaked abstractions, doc gaps revealed by the work.
- Output contract:
  - Emit ONLY a single JSON object to stdout. No prose, no markdown fence, no commentary.
  - Schema: `{"sharp_edges": [{"title": string, "body": string, "priority_hint": number}]}`.
  - `title` ≤ 80 chars, kebab-friendly.
  - `body` is a complete issue body — 1-3 short paragraphs, enough for a future triage to reason about it without rereading the diff.
  - `priority_hint` 1-10 (higher = more urgent), integer preferred but any finite number accepted.
  - Empty array (`"sharp_edges": []`) when no sharp edges. Always emit the wrapper object.
- Two concrete examples (one with entries, one empty), formatted as raw JSON.

### Success Criteria
- [ ] File exists with JSON-only contract clearly stated.
- [ ] No instruction nudges the agent to add markdown fences or prose.
- [ ] Both example outputs validate against the documented schema.
- [ ] `npm run sync-defaults` copies it to `.cycle/prompts/reflection.md`.

---

## Task 2: Append `reflection` step to the `feature` workflow

### Overview
Wire the new prompt into the workflow YAML so the engine actually invokes it.

### Changes Required
**File**: `src/defaults/workflows.yml`

Append after the existing `pr` step (line 23):
```yaml
      - { name: reflection, agent: claudecode, prompt: prompts/reflection.md }
```

Then run `npm run sync-defaults` so `.cycle/workflows.yml` mirrors.

### Success Criteria
- [ ] `feature.steps` ends with `reflection`.
- [ ] `loadWorkflow(repoRoot, "feature")` parses the new step without error (covered by existing workflow loader tests).
- [ ] `.cycle/workflows.yml` byte-identical to `src/defaults/workflows.yml` after sync.

---

## Task 3: New module `src/engine/reflection.ts` — `ingestReflection`

### Overview
Deterministic engine module that consumes the captured reflection stdout and materializes raw/ files. Pure logic; no LLM. Mirrors the shape of `src/engine/blocked.ts`.

### Changes Required
**File**: `src/engine/reflection.ts` (new)

Signature:
```ts
import type { Logger } from "./log.ts";
export type SharpEdge = { title: string; body: string; priority_hint: number };
export type IngestResult = { written: string[]; skipped: number };

export async function ingestReflection(
  repoRoot: string,
  cycleId: string,
  cycleSlug: string,           // unused beyond logging; kept for future hook
  stdout: string,
  log: Logger,
): Promise<IngestResult>;
```

Behavior:
1. **Parse stdout.** Strip a single optional leading/trailing fenced ```json … ``` defensively (a single regex; if the rest still fails JSON.parse → `parse_error`). Trim. `JSON.parse`. On throw: `log.emit("reflection.skipped", { cycle_id: cycleId, reason: "parse_error", message: err.message })`, return `{written: [], skipped: 0}`.
2. **Validate root shape.** Object with `sharp_edges` array. Otherwise same `reflection.skipped {reason: "parse_error", message: "missing sharp_edges array"}`, return.
3. **Idempotent unlink.** `readdir(rawDir)`; for every entry matching `^refl-<cycleId>-.+\.md$` call `unlink`. Errors swallowed (ENOENT acceptable; other errors logged as `reflection.skipped {reason: "unlink_failed", message}` once, but ingestion proceeds — partial cleanup is better than zero).
4. **Iterate entries.** For each `e: SharpEdge`:
   - Validate: `typeof e.title === "string" && e.title.trim() !== ""`, `typeof e.body === "string" && e.body.trim() !== ""`, `typeof e.priority_hint === "number" && Number.isFinite(e.priority_hint)`. On failure: `log.emit("reflection.skipped", { cycle_id: cycleId, reason: "invalid_entry", entry_index: i, field: <which> })`; `skipped++`; continue.
   - Compute slug: `slugify(e.title)`; if seen-in-pass, append `-N` (N starts at 2) until unique. Track in `Set<string>`.
   - `id = \`refl-${cycleId}-${slug}\``.
   - Frontmatter via `serializeFrontmatter({ id, source: "reflection", title: e.title, added_at: nowIso, triage_attempts: 0, priority_hint: e.priority_hint, origin_cycle_id: cycleId }, "\n" + e.body + "\n")`.
   - Atomic write via `atomicWrite(join(rawDir, \`${id}.md\`), content)` — extract `atomicWrite` from `triage.ts` to a shared util OR duplicate locally. Decision: **duplicate locally** as a private helper (≤ 15 lines). Extracting/exporting requires touching `triage.ts` and broadens its API surface; not worth the churn for one reuse. RESEARCH already flagged this is a known existing pattern.
   - Push `id` to `written[]`. Emit `reflection.surfaced { cycle_id: cycleId, raw_id: id, title: e.title, priority_hint: e.priority_hint }`.
5. **Summary.** Emit `reflection.summary { cycle_id: cycleId, count: written.length, skipped }` and return.

Helpers used: `slugify` from `src/issue/id.ts`, `serializeFrontmatter` from `src/engine/frontmatter.ts`, `mkdir/writeFile/rename/readdir/unlink` from `node:fs/promises`.

### Success Criteria
- [ ] File exists, exports `ingestReflection` matching signature above.
- [ ] No subprocess spawn (deterministic, pure file IO).
- [ ] All branches reachable from the unit tests in Task 5.
- [ ] `npm run typecheck` clean.

---

## Task 4: Wire `ingestReflection` into `run-cycle.ts`

### Overview
Invoke the ingestor after a successful reflection step and short-circuit failed reflection to non-fatal warning.

### Changes Required
**File**: `src/engine/run-cycle.ts`

Add import:
```ts
import { ingestReflection } from "./reflection.ts";
```

Inside the step loop (after the existing claudecode artifact write, before `step.end` is emitted — or right after, but before the `r.status === "failed"` branch):

```ts
if (step.agent === "claudecode") {
  r = await execClaudecodeStep(repoRoot, step.prompt!, cycleEnv);
  if (r.status === "ok" && step.name) {
    await writeFile(join(artifactDir, `${step.name.toUpperCase()}.md`), r.stdout, "utf8");
  }
  if (r.status === "ok" && step.name === "reflection") {
    await ingestReflection(repoRoot, cycleId, slug, r.stdout, log);
  }
}
```

Then modify the failed-return branch to short-circuit reflection:
```ts
if (r.status === "failed") {
  if (step.name === "reflection") {
    await log.emit("reflection.skipped", { cycle_id: cycleId, reason: "exec_failed", exit_code: r.exitCode });
    continue;
  }
  await log.emit("cycle.end", { cycle_id: cycleId, status: "failed", failing_step: step.name });
  return { cycleId, status: "failed" as const, failingStep: step.name };
}
```

(The `step.end` emission already happens above, so the `reflection.skipped` event lands between `step.end status: failed` and the loop tail.)

### Success Criteria
- [ ] `cycle.end` is emitted exactly once.
- [ ] When reflection step succeeds, `ingestReflection` runs and emits events before `cycle.end`.
- [ ] When reflection step fails, `reflection.skipped {reason: "exec_failed"}` emits and `cycle.end status: ok` still fires.
- [ ] When a non-reflection step fails, existing failed-return path is unchanged.

---

## Task 5: Unit tests for `ingestReflection`

### Overview
Native test-runner suite covering the seven SPEC acceptance criteria for the module.

### Changes Required
**File**: `tests/engine/reflection.test.ts` (new)

Test scaffolding mirrors `tests/engine/blocked.test.ts`:
- `makeLogger()` captures events into an array (`emit(event, fields) { events.push({event, fields}); }`).
- `setupRepo()` `mkdtemp(os.tmpdir() + "/cycle-refl-")` and pre-creates `docs/cycle/issues/raw/` and `.cycle/`.
- Per-test `try/finally` `rm(repo, {recursive: true, force: true})`.

Cases:
1. **Happy path, 2 entries, mixed priorities.** Stdout `{"sharp_edges":[{title:"foo bar",body:"...",priority_hint:7},{title:"baz",body:"...",priority_hint:3}]}` → 2 files in `raw/` with correct frontmatter (verify via `parseFrontmatter`), 2 `reflection.surfaced` events, 1 `reflection.summary {count:2, skipped:0}`.
2. **Empty array.** `{"sharp_edges":[]}` → 0 files, only `reflection.summary {count:0, skipped:0}` event.
3. **Malformed JSON.** Stdout `"not json"` → `reflection.skipped {reason:"parse_error"}` event; return `{written:[], skipped:0}`; no files.
4. **JSON fence stripping.** Stdout `"```json\n{\"sharp_edges\":[]}\n```"` → parses successfully, `reflection.summary {count:0}`. (Confirms defensive fence strip.)
5. **Missing `body` field on one entry.** 2 entries, second has empty body → 1 file written, 1 `reflection.skipped {reason:"invalid_entry", entry_index:1, field:"body"}`, 1 `reflection.surfaced`, `reflection.summary {count:1, skipped:1}`.
6. **Invalid `priority_hint` (string).** Entry with `priority_hint:"high"` → dropped with `field:"priority_hint"`.
7. **Slug collision.** 2 entries with identical title `"refactor x"` → both files written, ids `refl-0042-refactor-x.md` and `refl-0042-refactor-x-2.md`.
8. **Idempotent re-run.** Pre-create `refl-0042-stale.md` in `raw/` (cycle 0042 stale). Run ingest with new entries → stale file gone, only new files present.
9. **`priority_hint` accepts out-of-range numbers.** Entry with `priority_hint: 99` → entry written (no clamp, no drop).
10. **Root not an object.** Stdout `"[]"` → `reflection.skipped {reason:"parse_error", message: <mentions sharp_edges>}`.

Use cycle id `"0042"` and slug `"test-cycle"` as constants across tests.

### Success Criteria
- [ ] All 10 cases pass under `npm test`.
- [ ] `reflection.ts` line coverage ≥ 95%, branch ≥ 75%, function ≥ 90%.
- [ ] No subprocess invocation in any test.

---

## Task 6: Integration test — end-to-end runCycle with reflection step

### Overview
Drive `runCycle` against a stub workflow whose final step is a fake claudecode invocation that emits canned JSON; assert raw/ files materialize.

### Changes Required
**File**: `tests/engine/run-cycle.reflection.test.ts` (new)

Use the `workflowYml()` + PATH-injected fake claudecode pattern from `tests/engine/run-cycle.test.ts:15-77`:
- Build a minimal workflow with a single claudecode step named `reflection` whose prompt is a tmp `prompts/reflection.md` (empty content — fake binary ignores it).
- Stub `claude` binary: a bash script in a PATH-prepended `bin/` dir that prints `{"sharp_edges":[{"title":"hidden coupling","body":"...","priority_hint":7}]}` to stdout and exits 0.
- Pre-`git init` the repo, set `CYCLE_BASE=main`.
- Call `runCycle(repo, {issueId:"i1", title:"reflection e2e", workflow:"feature"})`.

Assertions:
1. Return value `{status: "ok"}`.
2. `docs/cycle/issues/raw/refl-<cycleId>-hidden-coupling.md` exists with `source: reflection` and `priority_hint: 7`.
3. `.cycle/log.jsonl` contains `reflection.surfaced` BEFORE `cycle.end`.
4. `cycle.end {status: "ok"}` is the last cycle-scoped event before the `cycle.checkout` finally block.

**Triage compatibility sub-assertion (lightweight):** after runCycle returns, instantiate `runTriage` with an injected `runAgent` mock that returns a canned `{children:[], ordering:[], decomposed_parents:[<id>]}` and assert it consumes the reflection raw file without schema errors. (Reuses pattern from `tests/engine/triage.test.ts:23-104`.)

**Failure case (separate test in same file):**
- Stub claudecode that exits 1 with stderr "boom".
- Assert: `runCycle` still returns `{status: "ok"}`; `reflection.skipped {reason:"exec_failed"}` present in log; `cycle.end {status:"ok"}` present; no `refl-*.md` in `raw/`.

### Success Criteria
- [ ] Both tests pass under `npm test`.
- [ ] No real `claude` binary invoked; PATH stub is honored.
- [ ] Event ordering assertion (`reflection.summary` before `cycle.end`) is explicit.

---

## Task 7: Documentation updates

### Overview
Capture the new architecture surface in CLAUDE.md and mark BB-7 done in RFC-001.

### Changes Required

**File**: `CLAUDE.md`
Add one bullet under "Architecture quick reference":
> - Reflection step: `src/engine/reflection.ts:ingestReflection(repoRoot, cycleId, slug, stdout, log)` runs after a successful terminal `reflection` step of `feature`. Parses stdout as `{sharp_edges[]}`, materializes each entry as `docs/cycle/issues/raw/refl-<cycleId>-<slug>.md` with `source: reflection` frontmatter (`priority_hint`, `origin_cycle_id` preserved for triage's view), emits `reflection.surfaced` per file and `reflection.summary` once. Parse / schema / exec failures emit `reflection.skipped` with a `reason` and do NOT flip `cycle.end` to failed (the code change is already merged via `pr`). Idempotent on resume: prior `refl-<cycleId>-*.md` in `raw/` are unlinked before re-writing.

Add the engine source file to the bullet listing engine modules (currently lists `run-cycle, scan, log, log-tail, branch, exec-bash, exec-claudecode, child-env, workflow, cycle-id, queue, frontmatter, blocked`) → add `reflection`.

**File**: `docs/RFC-001-issue-lifecycle.md`
- In §12 bootstrap-plan list, mark BB-7 done matching the existing BB-3..BB-6 style annotation.

### Success Criteria
- [ ] CLAUDE.md reflects the new module and behavior.
- [ ] RFC-001 §12 BB-7 marked complete.

---

## Testing Strategy

### Unit Tests (Task 5 — `tests/engine/reflection.test.ts`)
- All happy-path, malformed, schema-drop, slug-collision, idempotency, and edge-priority cases covered without subprocesses. Use direct module call with canned stdout strings.
- Mocking strategy: pass a captured-events logger struct directly — no spies, no subprocess stubs. `ingestReflection` is pure file IO + logger emit.
- Edge cases explicit: empty array, fenced JSON, NaN priority, non-object root, missing fields.

### Integration / E2E Tests (Task 6)
- Real `runCycle` with PATH-injected fake `claude`, real `.cycle/workflows.yml`, real `git init`.
- Asserts both end-to-end flow (raw/ materialization) and downstream triage compatibility.
- Failure-case test covers the non-fatal exec_failed path.

### Coverage Verification
- `npm run test:coverage` after Task 5 + 6. Confirm `src/engine/reflection.ts` ≥ 95/75/90. Confirm overall baseline holds.

## Risk Assessment
- **Step-name coupling in `run-cycle.ts`.** Hardcoding `step.name === "reflection"` couples engine to a default-prompt convention. Mitigation: documented in CLAUDE.md; the alternative (`step.kind` discriminator on `Step`) is YAGNI given there's only one reflection-like step. Revisit when a second engine-aware step appears.
- **Frontmatter escape regressions for titles containing colons/quotes.** `serializeFrontmatter` already handles `:` and `"`. Mitigation: a unit-test case uses a title with both characters and parses the resulting frontmatter round-trip.
- **`atomicWrite` duplication between `triage.ts` and `reflection.ts`.** Acknowledged duplication of a 15-line helper. Mitigation: if a third caller appears, extract to `src/engine/atomic-write.ts`. Not now.
- **Idempotent unlink races on resume.** If a `runTriage` pass is mid-flight when reflection re-ingests, both writers could mutate `raw/`. Mitigation: reflection ingest runs strictly inside `runCycle` before `cycle.end`, while triage runs in the CLI loop between cycles — they never overlap. Not a real race.
- **Reflection step output exceeding child stdout buffer.** `execClaudecodeStep` uses `spawn` (no buffer cap) and accumulates strings. A pathological multi-MB response could OOM. Mitigation: prompt explicitly caps `body` to "1-3 short paragraphs"; out of scope to enforce in engine this cycle. Note for future.
