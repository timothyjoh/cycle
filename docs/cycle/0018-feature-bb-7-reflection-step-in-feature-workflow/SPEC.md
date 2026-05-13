# SPEC — Cycle 0018: BB-7 Reflection Step in Feature Workflow

## Objective
Add a `reflection` step as the final step of the `feature` workflow so each completed cycle surfaces sharp edges (workarounds taken, deferred follow-ups, design smells) as structured JSON. The engine ingests each `sharp_edges[]` entry as a new raw/ file with `source: reflection`, letting the next triage pass front-of-queue self-healing work. This is the last bootstrap brick (RFC-001 §§9, 12 BB-7) and closes the loop on the engine self-improving its own backlog.

## Source Issue
`txt-20260513-034434-bb-7-reflection-step-in-feature-workflow` — "BB-7: Reflection step in feature workflow."

## Scope

### In Scope
- New `src/defaults/prompts/reflection.md`: prompt that reads cycle artifacts + git diff and emits `{sharp_edges: [{title, body, priority_hint}]}` JSON to stdout.
- `src/defaults/workflows.yml`: append `reflection` step (agent: claudecode, prompt: prompts/reflection.md) to the `feature` workflow, after `pr`.
- Engine post-step handling: after the `reflection` step succeeds, parse stdout as JSON, and for each `sharp_edges[]` entry write `docs/cycle/issues/raw/refl-<cycleId>-<slug>.md` with `source: reflection` frontmatter and the body.

### Out of Scope
- Adding reflection to `bug` / `research` workflows (feature only this cycle).
- LLM-driven triage prioritization based on `priority_hint` — triage continues to apply its existing ordering logic; `priority_hint` is recorded as a hint only.
- Reflection failure cascading into cycle failure semantics — a reflection step that fails (exit non-zero or malformed JSON) is reported but does not flip the cycle to `failed/` (the actual code change is already merged via the prior `pr` step). Treat reflection malformed-JSON / non-JSON output as a non-terminal warning that emits `reflection.skipped` and continues.
- Backfilling reflection for past cycles or any retroactive analysis.

## Requirements
- **Workflow declaration.** `feature` workflow in `src/defaults/workflows.yml` ends with a `reflection` step. `sync-defaults` propagates to `.cycle/workflows.yml`.
- **Prompt contract.** `reflection.md` instructs the agent to:
  - Read `SPEC.md`, `RESEARCH.md`, `PLAN.md`, `BUILD.md`, `REVIEW.md`, `MUST-FIX.md` (if present), `FIX.md` (if present) from `docs/cycle/<cycle_id>-<workflow>-<slug>/`.
  - Inspect `git diff <base>...HEAD` for the cycle's branch.
  - Inspect a tail of `.cycle/log.jsonl`.
  - Emit ONLY a JSON object to stdout matching `{sharp_edges: [{title: string, body: string, priority_hint: number}]}`. Empty array when no sharp edges. No prose, no markdown fence.
  - Use `priority_hint` 1–10 where higher = more urgent.
- **Engine ingestion.** After the reflection step's stdout is captured (existing claudecode artifact write to `REFLECTION.md` continues), the engine additionally:
  - Parses the stdout as JSON; on parse failure or schema mismatch, emit `reflection.skipped` event with `reason` and continue. Do not fail the cycle.
  - Validates each entry has non-empty `title` (string), `body` (string), `priority_hint` (number); drop invalid entries with a warning event.
  - For each valid entry, writes `docs/cycle/issues/raw/refl-<cycleId>-<slug>.md` with:
    ```yaml
    ---
    id: refl-<cycleId>-<slug>
    source: reflection
    title: <title>
    added_at: <ISO timestamp>
    triage_attempts: 0
    priority_hint: <priority_hint>
    origin_cycle_id: <cycleId>
    ---
    <body>
    ```
    Slug is `slugify(title)` truncated; collisions resolved by appending a numeric suffix.
  - Emits one `reflection.surfaced` event per file written with `{cycle_id, raw_id, title, priority_hint}` and a final `reflection.summary` event with `{cycle_id, count}`.
  - Empty `sharp_edges: []` → emit `reflection.summary {count: 0}` only.
- **Determinism.** Engine reflection-ingestion logic is pure deterministic (no LLM call) — it only parses and writes. Atomic per-entry write via tmp-rename.
- **Idempotency.** Re-running the reflection step on resume overwrites `REFLECTION.md` and re-ingests; existing `raw/refl-<cycleId>-*.md` files from a prior run are unlinked first so a re-run yields the same final raw/ state for that cycle. (Reflection step is the last step, so resume re-entering it is rare but possible.)
- **Triage compatibility.** Reflection-sourced raw files MUST be readable by existing `runTriage` without changes. `source: reflection` falls through the same enrichment path as `source: text`.

## Acceptance Criteria
- [ ] `src/defaults/workflows.yml` `feature` workflow has `reflection` as final step with `agent: claudecode, prompt: prompts/reflection.md`.
- [ ] `src/defaults/prompts/reflection.md` exists and instructs JSON-only stdout matching the schema.
- [ ] `npm run sync-defaults` propagates both to `.cycle/`.
- [ ] New module (e.g. `src/engine/reflection.ts`) exports `ingestReflection(repoRoot, cycleId, slug, stdout, log)` that returns `{written: string[], skipped: number}`.
- [ ] `run-cycle.ts` invokes `ingestReflection` after a successful reflection step's stdout is captured, BEFORE emitting `cycle.end`. Reflection-step parse failure does NOT change cycle status from ok to failed.
- [ ] Unit test: valid JSON with 2 entries → 2 files in `raw/` with correct frontmatter and body; both `reflection.surfaced` events emitted plus `reflection.summary {count: 2}`.
- [ ] Unit test: `sharp_edges: []` → no files written, only `reflection.summary {count: 0}`.
- [ ] Unit test: malformed JSON stdout → `reflection.skipped` event with `reason: "parse_error"`; cycle.end still emitted as ok.
- [ ] Unit test: entry with missing `body` → entry dropped with warning event; other valid entries still written.
- [ ] Unit test: slug collision (two entries with same title) → both files written with distinct ids (`-2` suffix).
- [ ] Integration test: end-to-end runCycle with a stubbed claudecode step returning canned JSON → asserts files appear in `raw/` and downstream `runTriage` accepts them.
- [ ] Idempotency test: invoking `ingestReflection` twice for the same `(cycleId, slug)` with the same stdout → final raw/ state identical (no duplicate entries).
- [ ] `cycle.end status: ok` is the terminal event; `reflection.summary` precedes `cycle.end`.
- [ ] All existing tests still pass.
- [ ] `npm run typecheck` clean.
- [ ] Coverage: line ≥ 95%, branch ≥ 75%, function ≥ 90% (no regression vs master baseline).

## Testing Strategy
- **Framework.** Node's native test runner (`node --test`), spec reporter. Tests live in `tests/engine/reflection.test.ts` (unit) and extend `tests/run-cycle.test.ts` or a new `tests/run-cycle.reflection.test.ts` (integration).
- **Unit coverage for `ingestReflection`:** happy path (2 entries, mixed priorities), empty array, malformed JSON, missing/invalid fields per entry, slug collision, idempotent re-run.
- **Integration coverage:** drive `runCycle` with a stub workflow whose final step is a fake claudecode invocation returning controlled stdout; assert raw/ files materialize and that `runTriage` (mock claudecode) can subsequently consume them without schema errors.
- **Event ordering:** assert `reflection.summary` lands before `cycle.end` in `log.jsonl`.
- **Reflection failure non-fatal:** simulate a reflection step that exits non-zero (e.g. throws inside the stubbed exec) — cycle status remains the status determined by the preceding `pr` step (ok); a `reflection.skipped {reason: "exec_failed"}` event is recorded.
- No UI / Playwright work — this is engine-only.

## Documentation Updates
- **CLAUDE.md.** Add a one-paragraph note under the architecture quick reference: reflection step is the terminal step of `feature`, parses JSON `sharp_edges[]` to `raw/`, non-fatal on parse failure. Reference `src/engine/reflection.ts`.
- **`docs/RFC-001-issue-lifecycle.md` §12.** Mark BB-7 as completed once landed (status line at the top of the section if conventions hold, otherwise inline annotation matching BB-3..BB-6 style).
- **`src/defaults/prompts/reflection.md`.** The prompt itself is the user-facing doc for what reflection examines — keep it tight and example-driven so the agent reliably emits JSON-only.
- **No README change.** Reflection is internal engine behavior; users see the new raw/ entries naturally on the next triage pass.

## Dependencies
- BB-3 (live `tbd.jsonl` drain) — landed.
- BB-4 (triage subroutine, `runTriage`) — landed; will consume reflection-sourced raw/ files unchanged.
- BB-5 (resume from log tail) — landed; reflection step is restart-tolerant because `REFLECTION.md` is overwritten and stdout is re-parsed.
- BB-6 (`propagateBlocked`, halt policy) — landed; reflection runs only on successful cycles so failure paths are not exercised here.
- No new external services. No env vars beyond what the engine already injects (`CYCLE_ID`, `CYCLE_TITLE`, `CYCLE_BASE`, `CYCLE_ISSUE_ID`).
- `slugify` from `src/issue/id.ts` reused for collision-safe filenames.
