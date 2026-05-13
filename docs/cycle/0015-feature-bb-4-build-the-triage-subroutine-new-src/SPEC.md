# SPEC — Cycle 0015: Triage Subroutine (BB-4)

## Objective
Land the triage subroutine: an engine-internal pass that converts `raw/` drops into enriched, ordered `todo/` work items by spawning a configurable agent, validating its JSON output, and applying queue mutations atomically. After this cycle the engine's inbox (`raw/`) becomes the real entry point for all issue ingestion, replacing the current passthrough `scanRaw` shim.

## Source Issue
`txt-20260513-034359-bb-4-build-the-triage-subroutine-new-src` — "BB-4: Build the triage subroutine."

## Scope

### In Scope
- New `src/engine/triage.ts` that spawns the agent configured under `triage:` in `workflows.yml`, parses+validates stdout JSON (`children[]`, `ordering[]`, `decomposed_parents[]`), and applies the result atomically (write `todo/<id>.md`, move `raw/<id>.md → done/<id>_raw.md`, rewrite `tbd.jsonl` in the new ordering). Per-raw retry up to 3 attempts feeding the validator error back as one-shot self-correction; on whole-pass failure emit `engine.paused` and exit non-zero.
- New `src/defaults/prompts/triage.md` template describing inputs (raw bodies, current `tbd.jsonl`, `todo/` context) and the required output JSON shape.
- Wire triage into the engine orchestrator (`src/cli.ts`): run once at `engine.start` after the in-flight resume check is a no-op (no in-flight cycle exists yet — full resume lands in BB-5), and again between cycles before the next pop if `raw/` is non-empty. Replace `scanRaw`'s raw→todo move with a triage call.

### Out of Scope
- Resume-from-`log.jsonl` semantics (BB-5).
- `propagateBlocked` and `max_consecutive_failures` halt counter (BB-6 — current single-failure halt stays).
- Reflection step (BB-7).
- Multi-agent abstraction beyond `agent: claudecode` (codex/gemini exec modules deferred).
- Smarter `depends_on` inference — only honor what the agent emits.

## Requirements
- `triage.ts` exports `runTriage(repoRoot, cfg, log): Promise<{ status: "ok" | "paused"; processed: string[]; failed: string[] }>`.
- Loads `cfg.triage` (`agent`, `prompt`, `max_turns`) and spawns the agent via `spawn` with array args, `shell: false`, inheriting the curated PATH from `child-env.ts`. No `exec`/`execSync`.
- Reads every `*.md` in `docs/cycle/issues/raw/` (after `mkdir -p`), preserves frontmatter via `parseFrontmatter`, and passes raw bodies + current `tbd.jsonl` rows + `todo/` listing into the prompt as a single rendered input block.
- Stdout must be valid JSON matching:
  - `ordering: string[]` — final pending order for the queue (in_progress rows are fenced; triage cannot reorder them).
  - `children: Array<{ raw_id, slug, id, title, workflow, depends_on, body }>` — every field required; `workflow` must match a `workflows[].name`; `id` must equal `<raw_id>-<slug>` and be unique within the batch and against existing queue ids.
  - `decomposed_parents: string[]` — subset of `raw_id`s explicitly decomposed; non-decomposed raws (single-child enrichment) still get their `raw/<id>.md → done/<id>_raw.md` move, per RFC §5.
- Schema validation is fail-fast with a structured error string (which field, which value). On validator failure for a given raw, retry up to 3 times total (counter persisted via the existing `triage_attempts` frontmatter field), prepending the prior error message to the prompt as feedback.
- Apply mutations atomically per successful raw: write `todo/<id>.md` via tmp-rename, append a `QueueRow` to `tbd.jsonl`, then move the raw file to `done/<id>_raw.md`. If any step fails, leave the raw file in place and surface the error to the caller.
- After processing all raws, rewrite `tbd.jsonl` in `ordering[]` (pending rows reorder; in_progress rows stay at the top in their existing order — written first, then pending in the agent-supplied order, then any pending rows the agent omitted appended at the end with a `triage.warning` log).
- Emit `triage.start`, `triage.raw.ok`, `triage.raw.failed` (with `attempt`, `reason`), `triage.end` events to `log.jsonl`.
- If every raw in the pass fails its 3-attempt budget, emit `engine.paused` (reason: `triage_failed`) and exit with non-zero status from `cli.ts`. Successful raws from the same pass are preserved on disk.
- After exhausting 3 attempts for a single raw (with at least one other raw succeeding), move `raw/<id>.md → failed/<id>.md` with `triage_attempts: 3` and continue.

## Acceptance Criteria
- [ ] `src/engine/triage.ts` and `src/defaults/prompts/triage.md` exist and `npm run sync-defaults` produces the prompt under `.cycle/prompts/triage.md`.
- [ ] `cli.ts` calls triage at engine.start before the pop loop, and again at the top of the loop when `raw/` is non-empty; `scanRaw` no longer performs the raw→todo move (kept only as a thin guard around legacy archive, or deleted if redundant).
- [ ] Integration test drives a stubbed claudecode (fixture stdout JSON) end-to-end: a single `raw/parent.md` decomposes into two `todo/*.md` files with correct frontmatter, `done/parent_raw.md` is created, `tbd.jsonl` has both rows in the agreed ordering, and `triage.start`/`triage.end` appear in `log.jsonl`.
- [ ] Unit tests cover: schema validator rejects each missing/wrong field with a specific message; retry path injects the prior error into the prompt; 3-attempt exhaustion moves raw → `failed/` with `triage_attempts: 3`; whole-pass failure emits `engine.paused` and exits non-zero.
- [ ] Coverage holds the master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%); deltas reported in `BUILD.md`/`FIX.md`.
- [ ] All existing tests still pass; no new compiler/linter warnings.

## Testing Strategy
- Node native test runner with `--experimental-strip-types`, matching the rest of `tests/engine/`.
- Stub the claudecode subprocess by injecting an `execTriageAgent` boundary (e.g., function arg or module-local override) so tests feed canned stdout/exit-code without spawning `claude`. No real CLI invocations in tests.
- Scenarios:
  - **Happy path, decompose.** One raw with two children → two todo files, parent to `done/`, `tbd.jsonl` ordered per `ordering[]`.
  - **Happy path, enrich-only.** One raw with one child whose `id == raw_id` → single todo, raw still moves to `done/<id>_raw.md`.
  - **Reordering.** Triage with one existing pending row + one new raw whose `ordering[]` lists the new id first → rewritten `tbd.jsonl` reflects new order; in-progress rows would stay fenced (covered with a fixture that has an in_progress row to assert no-move).
  - **Validator failure → retry.** First stdout omits `depends_on`; second includes it → success after attempt 2; `triage_attempts: 2` recorded for that raw before success cleared it.
  - **3-attempt exhaustion, partial.** One raw fails all 3 attempts; one raw succeeds in the same pass → first goes to `failed/` with `triage_attempts: 3`, second lands in `todo/`, `engine.paused` is NOT emitted.
  - **Whole-pass failure.** Only raw fails 3 attempts → `engine.paused` emitted; `cli.ts` exits non-zero.
  - **Atomic apply.** Inject a write failure between todo-write and raw-move → raw stays in `raw/`, no half-written todo, queue unchanged.
- No UI surface, so no Playwright work.

## Documentation Updates
- **CLAUDE.md** — extend the "Architecture quick reference" line on triage to describe the subroutine (file path, trigger points, retry semantics) and note `scanRaw`'s reduced role.
- **`docs/RFC-001-issue-lifecycle.md`** — no spec changes (RFC §5 is the spec); add an "Implemented in cycle 0015" note at the bottom of §5 if precedent exists, otherwise leave untouched.
- **`BRIEF.md`** — its Triage section already defers to the RFC; no change needed unless a phrase drifts.
- No README change (engine surface unchanged from a caller's perspective).

## Dependencies
- `workflows.yml` already carries the `triage:` block (BB-2). `loadConfig` already exposes it.
- `tbd.jsonl` row schema and drain semantics from BB-3 are in place; this cycle only adds new rows and rewrites order.
- `parseFrontmatter` / `mutateFrontmatter` cover all needed frontmatter I/O.
- `child-env.ts` provides the curated PATH for the spawned `claude` subprocess.
- No new env vars. No new external services.
