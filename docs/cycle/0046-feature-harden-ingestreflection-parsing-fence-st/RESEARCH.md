```markdown
# Research: Cycle 0046

## Cycle Context

SPEC.md asks for three changes inside `ingestReflection` (and its prompt): (1) add a single-pass JSON repair that trims trailing prose after the last balanced top-level `}`/`]` and re-parses once; (2) on continued parse failure, escalate the raw stdout to `docs/cycle/issues/raw/refl-<cycleId>-parse-error.md` (8 KB head-kept, `source: reflection`, `priority_hint: 7`, `origin_cycle_id`) while still emitting `reflection.skipped {reason: parse_error}` and a final `reflection.summary` without flipping `cycle.end`; (3) append a one-shot bad-output example to `src/defaults/prompts/reflection.md` and re-sync. Fence-strip already exists and is out of scope.

## Current Codebase State

### Relevant Components

- `ingestReflection` (single function, ~120 lines): `src/engine/reflection.ts:12-120`. Owns the entire reflection→raw materialization pipeline.
- Fence-strip path: `src/engine/reflection.ts:10` (`FENCE_RE = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/`) applied at `:21-23`. Anchored at start/end, so leading prose before the fence currently falls through to parse_error (regression test pins this at `tests/engine/reflection.test.ts:134-146`).
- Current parse + skip path: `src/engine/reflection.ts:25-35` — `JSON.parse(stripped)` in a `try/catch`; failure emits `reflection.skipped {reason:"parse_error", message}` and `return { written: [], skipped: 0 }` with **no `reflection.summary`** (asymmetric vs other early-return at `:37-44` which also returns without summary).
- Schema-shape guard ("missing sharp_edges array"): `src/engine/reflection.ts:37-44` — same `parse_error` reason but distinct message; same no-summary early return.
- Cleanup loop for prior `refl-<cycleId>-*.md` files in `raw/`: `src/engine/reflection.ts:48-59`. Pattern `^refl-${cycleId}-.+\.md$` already matches a `refl-<cycleId>-parse-error.md` file, so escalation re-runs idempotency comes for free **iff the escalation write happens after this loop** (matches SPEC §"Escalation MUST be idempotent on resume").
- Per-entry slug uniquification (in-pass `usedSlugs` Set): `src/engine/reflection.ts:63,82-88`. The collision-suffixing logic (`${slug}-${n}`, starting at 2) is the same logic the new escalation slug needs to feed through.
- Frontmatter writer: `serializeFrontmatter(fm, "\n" + body + "\n")` at `:91-102` writes a leading-blank-line then body then trailing newline. Reuse for the parse-error file.
- Atomic write (tmp + rename, with tmp cleanup on rename error): `src/engine/reflection.ts:130-144`. Already swallowed-error-tolerant; reuse for the escalation write.
- Event emission shape: `log.emit("reflection.skipped", {cycle_id, reason, message})` at `:29-33`, `log.emit("reflection.surfaced", …)` at `:105-110`, `log.emit("reflection.summary", {cycle_id, count, skipped})` at `:113-117`.

### Existing Patterns to Follow

- **Tmp-rename atomic write**: `atomicWrite(path, content)` at `src/engine/reflection.ts:130-144` is the canonical write primitive in this file. Same helper is what we want for the escalation file.
- **Slug fallback when slugify→""**: `if (slug === "") slug = "entry";` at `:81`, validated by `tests/engine/reflection.test.ts:384-397`. The escalation slug (`"parse-error"`) is non-empty so this path is irrelevant, but the collision-suffix loop at `:82-87` is the pattern to drive collisions through.
- **Frontmatter shape for reflection-sourced raws**: `{id, source: "reflection", title, added_at, triage_attempts: 0, priority_hint, origin_cycle_id}` at `:91-101`. The parse-error file must match this shape (SPEC §Requirements + §Acceptance Criteria). `title` for the escalation file is not pinned by SPEC — choose one and lock it in tests.
- **Slugify helper**: `slugify(text)` at `src/issue/id.ts:1-8` — lowercase, non-alphanumeric → `-`, trim leading/trailing `-`, 40-char cap. `"parse-error"` round-trips unchanged.
- **`reflection.skipped` event shape**: `{cycle_id, reason, message}` for parse failures vs `{cycle_id, reason, entry_index, field}` for per-entry failures (`:70-75`). The escalation path preserves the parse-failure shape.
- **Cycle terminates successfully even when reflection skips**: `run-cycle.ts:148-149` calls `ingestReflection` only on `r.status === "ok"`; the function never throws into the caller for parse errors (every parse-failure early return goes through `return { written: [], skipped: 0 }`), so `cycle.end` is never flipped — the SPEC invariant ("MUST NOT flip cycle.end to failed") is already structurally guaranteed by the early-return pattern, not by a try/catch upstream.
- **Default prompt drift discipline**: `src/defaults/prompts/reflection.md` is source of truth; `.cycle/prompts/reflection.md` is its synced copy. `npm run sync-defaults` runs `scripts/sync-defaults.mjs` which `rm -rf`s `.cycle/prompts/` and copies from `src/defaults/prompts/`. Currently the two files match byte-for-byte (verified via `diff -q`).

### Dependencies & Integration Points

- Caller: `src/engine/run-cycle.ts:148-149` — invoked after the `reflection` step exits 0. Function return value is ignored; observed effects flow through `log` events and filesystem writes only.
- Filesystem deps: `node:fs/promises` (`mkdir`, `readdir`, `rename`, `unlink`, `writeFile`) — already imported at `src/engine/reflection.ts:1`. No new imports needed for escalation.
- Path helpers: `node:path` (`dirname`, `join`) — already imported `:2`.
- ID helper: `slugify` from `../issue/id.ts` — already imported `:3`.
- Frontmatter helper: `serializeFrontmatter` from `./frontmatter.ts` — already imported `:4`. Handles `id`/`title`/numeric/string-array values; quoting rules at `src/engine/frontmatter.ts:34-49`.
- Logger contract: `Logger` interface at `:5` (only `emit(event, fields)` is used here).
- `Buffer.byteLength` for 8 KB truncation: Node builtin, no import.
- No new packages required (SPEC §Dependencies).

### Test Infrastructure

- Test framework: Node's native test runner (`node --test`), the project default — `tests/engine/reflection.test.ts` already uses `import { test } from "node:test"` and `import { strict as assert } from "node:assert"`.
- Test conventions:
  - Per-test `setupRepo()` helper at `tests/engine/reflection.test.ts:23-28` creates a `mkdtemp` sandbox with `.cycle/` and `docs/cycle/issues/raw/` pre-created.
  - Each test wraps body in `try { … } finally { await rm(root, { recursive: true, force: true }) }` for cleanup.
  - `makeLogger()` factory at `:11-21` returns `{events, logger}` where `events: EmittedEvent[]` and `logger.emit` pushes onto the array. Use this for asserting on `reflection.skipped`/`reflection.summary` ordering and shape.
  - `fileExists` helper at `:30-37` (stat-based) used for checking written/unlinked files.
  - Constants `CID = "0042"`, `SLUG = "test-cycle"` at `:39-40`.
  - Frontmatter assertions use `parseFrontmatter(body)` from `src/engine/frontmatter.ts` (already imported `:7`), checking `fm.id`, `fm.source`, `fm.title`, `fm.priority_hint`, `fm.origin_cycle_id`, etc. (template at `:60-71`).
  - Existing parse-failure regression: `:103-117` ("not json at all" → single skipped event, zero files). Under SPEC, this same input now writes a parse-error file plus a `reflection.summary`, so this test MUST be updated (it currently asserts `events.length == 1`).
  - Existing fence-success: `:119-132`. Stays green.
  - Existing fenced-with-leading-prose → parse_error: `:134-146`. After repair pass: the input is `Here is the output:\n```json\n{sharp_edges:[]}\n```` — the trailing fence is not balanced-JSON, so repair still fails and escalation runs. This test MUST also be updated.
- Current coverage baseline (per CLAUDE.md, as of 2026-05-13): line ≥ 95%, branch ≥ 75%, function ≥ 90%. New code (repair-pass loop, truncation, escalation write) must come with tests in the same cycle.
- Snapshot of recent green state: 343 tests passing on master (observation 876, 2026-05-14).

## Code References

- `src/engine/reflection.ts:10` — `FENCE_RE` regex (already strips ```` ```json … ``` ```` wrappers; anchored, so leading prose doesn't match).
- `src/engine/reflection.ts:21-23` — fence-strip applied after `trim()`.
- `src/engine/reflection.ts:25-35` — `JSON.parse(stripped)` try/catch and current early-return skip path (no `reflection.summary` on this branch). This is the insertion point for the repair pass + escalation.
- `src/engine/reflection.ts:37-44` — `sharp_edges`-shape guard; another `parse_error` skip branch (also no summary). Out of SPEC scope, but adjacent; do not regress.
- `src/engine/reflection.ts:48-59` — prior `refl-<cycleId>-*.md` cleanup loop; pattern already covers the parse-error file.
- `src/engine/reflection.ts:63-88` — `usedSlugs` Set + collision-suffix loop. SPEC §Acceptance "Slug-collision suffixing still applies" — the escalation slug must register here so a sharp-edge titled `"parse error"` colliding with the escalation gets `-2` deterministically.
- `src/engine/reflection.ts:91-103` — frontmatter shape + atomicWrite call site. Pattern for the escalation write.
- `src/engine/reflection.ts:130-144` — `atomicWrite(path, content)`. Reuse.
- `src/defaults/prompts/reflection.md:78-85` — "Discipline" section. SPEC §Documentation: insert the one-shot bad-output example immediately after.
- `.cycle/prompts/reflection.md` — synced copy; must match `src/defaults/` byte-for-byte after `npm run sync-defaults`.
- `tests/engine/reflection.test.ts:103-117` — parse_error regression that must be updated to expect both the skip event AND the parse-error raw file AND the summary.
- `tests/engine/reflection.test.ts:134-146` — leading-prose-before-fence parse_error regression; same update.
- `CLAUDE.md:52` — "Reflection step" bullet. SPEC §Documentation: extend single sentence covering repair pass + parse-error escalation.
- `src/engine/run-cycle.ts:148-149` — sole caller; no signature change implied.
- `scripts/sync-defaults.mjs:1-25` — `rm -rf` + `cp` from `src/defaults/{prompts,scripts}` and `workflows.yml`. Run after editing `src/defaults/prompts/reflection.md`.

## Open Questions

1. **Title field for the escalation file.** SPEC pins frontmatter `source`/`priority_hint`/`origin_cycle_id`/body shape but leaves `title` unspecified. The materializer requires a non-empty `title` (per `validateEntry` at `:122-128` — though escalation bypasses that validator). Candidates: `"reflection stdout failed to parse"`, `"parse error"`, `"reflection.parse_error <cycleId>"`. Planner picks one and tests pin it.
2. **`reflection.skipped` ordering vs raw write.** SPEC §Requirements says "pick one and lock it in tests" — emit-then-write or write-then-emit. Both work; planner decides.
3. **`reflection.summary` emission on the escalation path.** SPEC §Acceptance bullet 2 names the skip event and the raw write but not the summary. Existing parse-failure branches in `:25-44` skip summary too. SPEC §Scope §2 says "Still emit `reflection.skipped {reason: parse_error, message}` and a final `reflection.summary`." — this is a behavior change vs current code (summary newly emitted on this path). Planner must thread the summary call into the escalation return (and decide whether the existing schema-shape guard branch at `:37-44` should also start emitting summary, or stay asymmetric).
4. **Collision-suffix test shape.** SPEC §Testing offers two phrasings: pre-seed `raw/refl-<cycleId>-parse-error.md` OR simulate a sharp-edge titled `parse error` alongside the escalation. The first variant collides with the unlink-cleanup loop (which deletes the pre-seeded file before the escalation write), so the second variant is the only one that exercises the in-pass `usedSlugs` Set. Planner confirms wording.
5. **Where in the pass does the in-pass `usedSlugs` Set get pre-populated with `"parse-error"`?** Today the Set is populated mid-loop. If escalation pre-registers `"parse-error"` before the entry loop, a sharp-edge titled `"parse error"` becomes `-2`. If escalation runs after the entry loop, the sharp-edge wins the bare slug and escalation becomes `-2`. SPEC is silent — but escalation only runs when `JSON.parse` fails twice, in which case there ARE no entries to loop over, so the question only matters if a future repair-pass surfaces partial entries (out of scope per "single repair attempt"). Planner can resolve this away by structuring escalation as a strictly separate code path that never sees `usedSlugs` — but then SPEC §Acceptance bullet 6 needs reinterpretation. Flagging for planner.
6. **8 KB truncation marker placement.** SPEC §Requirements: "append a single `\n…\n` marker." Planner pins exact bytes (`\n…\n` is 5 UTF-8 bytes; 8192 + 5 = 8197 cap, or truncate to 8192 - 5 = 8187 then append marker to total 8192). Tests need to know which.
```
