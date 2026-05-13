Now write RESEARCH document to stdout per cycle protocol.

```markdown
# Research: Cycle 0022

## Cycle Context
SPEC asks for an additive enrichment of the single `engine.paused` event emitted by `src/engine/triage.ts` so the failure surface is self-describing. The event today carries `{ reason: "triage_failed", failed }`. SPEC requires `reason: "all_triage_failed"`, `raw_ids: string[]`, `last_errors: Array<{raw_id, error}>` (same length and order as `raw_ids`, each `error` truncated to ≤2000 chars), with `failed` retained as an alias of `raw_ids` for one release (BUILD.md may justify dropping it). Behavior — when the event fires, exit codes, and ordering — does not change.

## Current Codebase State

### Relevant Components

- **Triage engine entry**: `src/engine/triage.ts:67` — `runTriage(repoRoot, cfg, log, deps)`. Single source for `engine.paused`.
- **Per-raw retry loop**: `src/engine/triage.ts:105-196`. `lastError` (`string`, line 107) is the captured prompt-feedback string; it is overwritten on every failed attempt at lines 127, 138, 157, 170 and reset to `""` at the top of every outer iteration when a new raw begins. After the inner `for (attempt...)` exits without success, `lastError` holds the last attempt's reason for this raw. **This is the exact string SPEC requires for `last_errors[i].error`.**
- **Whole-pass fail emission site**: `src/engine/triage.ts:202-205`.
  ```
  if (failed.length === raws.length) {
    await log.emit("engine.paused", { reason: "triage_failed", failed });
    return { status: "paused", processed, failed };
  }
  ```
  The condition `failed.length === raws.length` (with `raws.length > 0` implied by the `raws.length === 0` early-return at line 88) is the trigger and is unchanged by SPEC.
- **Per-raw failure logger**: `src/engine/triage.ts:129-133, 140-144, 159-163, 171-176`. `triage.raw.failed` events already carry `{raw_id, attempt, reason}` — the same `lastError` string. Reusing the in-memory `lastError` for `last_errors` avoids re-deriving from the log.
- **Result type**: `src/engine/triage.ts:35-39` — `TriageResult = {status, processed, failed}`. Currently exposes `failed: string[]`; SPEC does not require shape changes to the return value, only to the emitted event payload.
- **Logger interface**: `src/engine/log.ts:4-6, 8-18`. `Logger.emit(event, fields)` accepts any `Record<string, unknown>`; adding `raw_ids` and `last_errors` requires no Logger changes. Each emit JSON-stringifies the whole object into `.cycle/log.jsonl`.

### Existing Patterns to Follow

- **Reason literal strings**: `reason: "<snake_case>"` already in use for `engine.paused`, `engine.halted` (`max_consecutive_failures`), `triage.warning` (`ordering_omitted`), `triage.raw.failed` (free-form string). SPEC's `"all_triage_failed"` follows the snake_case convention.
- **`triage.raw.failed` payload shape**: `{raw_id, attempt, reason: string}` (e.g. `src/engine/triage.ts:129-133`). `last_errors[i] = {raw_id, error}` parallels this shape (different field name `error` per SPEC).
- **Event additive evolution**: prior cycles (BB-6, BB-7) added fields to existing events without bumping a schema version. The codebase has no event-schema registry; consumers do best-effort field reads.
- **Test event capture**: `tests/engine/triage.test.ts:37-47` — `makeLog()` returns a `Logger` that pushes `{event, fields}` into an in-memory `Captured[]`. New tests should reuse this fixture (see `tests/engine/triage.test.ts:480-485` and `:487-518` for the canonical patterns asserting on `engine.paused`).
- **Per-raw retry test scaffolding**: `tests/engine/triage.test.ts:438-485` (one fail + one success) and `:487-518` (whole-pass fail) already simulate the relevant scenarios via a deterministic `runAgent` stub gated on `prompt.includes("=== raw: X ===")`. The truncation case can extend this pattern by returning a long stderr or a long stdout that produces a long validator reason.

### Dependencies & Integration Points

- **CLI wiring**: `src/cli.ts:82-92` (engine.start triage gate) and `src/cli.ts:320-329` (between-cycle triage). Both branch on `triageResult.status === "paused"`. Neither inspects `engine.paused` payload fields; both rely solely on the `status` return value. **No CLI change required for SPEC.**
- **engine.stop separate field**: `src/cli.ts:108, 325, 396` use a separate `haltReason = "triage_failed"` that ends up on `engine.stop` (not `engine.paused`). SPEC scope is `engine.paused` only — leaving `engine.stop.reason: "triage_failed"` untouched is consistent with the "no event other than `engine.paused`" non-functional requirement (SPEC §Non-functional).
- **Bundled dist**: `.cycle/bin/cycle.js` contains the inlined `engine.paused` emission (lines 7843, 8759, 8940, 9000). `npm run sync-defaults` + `npm test` (which runs `pretest` build) regenerates the bundle from `src/`.
- **No external readers of `engine.paused`**: a repo-wide grep shows the only consumers of the literal `"triage_failed"` string from `engine.paused` are the docs (SPEC, RFC-001, BRIEF, ARCHITECTURE) and the one test at `tests/engine/triage.test.ts:505`. The `triage_failed` references in `src/cli.ts` are for `engine.stop.reason`, not `engine.paused`. SPEC's "keep `failed` as alias" allowance is therefore safe to drop if BUILD.md notes the choice.

### Test Infrastructure

- **Framework**: Node native test runner (`node --test`, spec reporter), TypeScript run directly via `--experimental-strip-types`. Top-of-file imports: `import { test } from "node:test"; import { strict as assert } from "node:assert";`.
- **Layout**: triage-related tests in `tests/engine/triage.test.ts` (16 tests, lines 1-1103) and `tests/engine/triage-validator.test.ts`. CLI-level smoke at `tests/cli/triage.test.ts` (166 lines, no `engine.paused` assertions there).
- **Fixtures**: `setupRepo()` at `tests/engine/triage.test.ts:49-62` creates a temp repo with `.cycle/prompts/triage.md` (placeholder template), `docs/cycle/issues/{raw,todo,done,failed}/`. `rawBody(id, title, attempts=0)` at `:64-77` writes a raw frontmatter+body. `decomposeJson(rawId)` `:79-104`, `enrichJson(rawId)` `:106-122` give canonical happy-path stdouts. `makeConfig()` `:23-35` returns a minimal `CycleConfig` with one `feature` workflow.
- **Mocking approach**: `TriageDeps.runAgent` (`src/engine/triage.ts:29-31`) is the only injection point. Tests pass an inline `async (prompt) => TriageAgentResult`. No filesystem or process mocking needed.
- **Coverage policy**: line ≥ 95%, branch ≥ 75%, function ≥ 90% (`CLAUDE.md` — Coverage policy). `triage.ts` line coverage is currently 93.5% (below the 95% baseline) per reflection refl-0021. SPEC change is additive and small; new tests covering the truncation and ordering branches should hold or improve coverage. Coverage is enforced by `npm run test:coverage`.

## Code References

- `src/engine/triage.ts:107` — `let lastError = "";` (the SPEC's reusable per-raw final-error string)
- `src/engine/triage.ts:127, 138, 157, 170` — each assignment is the *only* writer of `lastError` per attempt; after the inner loop exits, the last write is the terminal error
- `src/engine/triage.ts:192-196` — `if (!succeeded) { failed.push(raw.id); await moveToFailed(...) }`. The `lastError` value for this raw must be captured here (or held alongside `failed`) to be available at the line 202-205 emission site.
- `src/engine/triage.ts:202-205` — single emission site; SPEC change is local to these 4 lines plus whatever collection holds the per-raw final errors
- `src/engine/triage.ts:88-91` — `raws.length === 0` early return guarantees the `failed.length === raws.length` check at 202 is never true on empty raw/, so SPEC's "empty pass does not emit `engine.paused`" already holds
- `src/cli.ts:82-92` — CLI engine.start triage branch (reads only `status`)
- `src/cli.ts:320-329` — CLI between-cycle triage branch (reads only `status`)
- `tests/engine/triage.test.ts:480-485` — existing assertion: `engine.paused` must NOT fire on partial success (SPEC AC #2 — this test already covers it)
- `tests/engine/triage.test.ts:487-518` — existing whole-pass `engine.paused` test; line 505 (`assert.equal(paused?.fields.reason, "triage_failed")`) is the one assertion SPEC §Acceptance Criteria allows to change to `"all_triage_failed"`
- `tests/engine/triage.test.ts:545-586, 588-630` — atomic-rollback paths that exhaust all 3 attempts on the only raw and emit `engine.paused`; these tests do not currently assert on `reason` so they should not need modification under SPEC
- `tests/engine/triage.test.ts:683-708, 710-731, 733-752` — tests that exercise persisted-attempts, agent-throw, and non-zero-exit paths and end in `status: "paused"`; they assert on `triage.raw.failed.reason` (the same per-raw string SPEC asks to reuse) but not on the `engine.paused` payload, so no contract change required
- `tests/engine/triage.test.ts:1066-1103` — `validator rejects each missing/wrong field…`: status `"paused"`, asserts on `triage.raw.failed.reason`; not blocked by SPEC change
- `.cycle/bin/cycle.js:7843` — bundled mirror of `src/engine/triage.ts:203`. Rebuilt by `pretest`/`pretest:coverage`.
- `CLAUDE.md` — "Triage subroutine" bullet is the documentation target for SPEC §Documentation Updates.

## Open Questions

- **Keep `failed` alongside `raw_ids`, or drop it?** SPEC §Functional explicitly defers this to the implementer with a "note in BUILD.md" allowance. Repo grep confirms zero external readers of the `engine.paused.failed` field (only the docs reference the event, and the one test at `tests/engine/triage.test.ts:505` is part of the diff). The plan step should pick one (alias-for-one-release vs. drop now) and record the choice — there are no codebase consumers forcing the decision.
- **Where to collect the per-raw `lastError` for the final emission.** Two natural shapes: (a) a parallel `lastErrors: string[]` array appended in lockstep with `failed.push(raw.id)` at `src/engine/triage.ts:193`; or (b) a `Map<string,string>` keyed by `raw.id` then materialized in `raw_ids` order at emission time. Shape (a) preserves order without a separate lookup and matches the SPEC's "same length and same order" invariant by construction. Plan step picks one.
- **Truncation marker (`…` suffix vs. plain slice).** SPEC permits but does not require the ellipsis marker. Plan step decides; either satisfies "≤ 2000 chars" and the O(1) `slice` requirement.
- **Coverage regression on `triage.ts`.** Per refl-0021, this file is at 93.5% line coverage — below the 95% baseline. The SPEC change is additive and tested; plan should confirm new tests don't worsen and ideally lift it back to ≥95% in the same cycle (or call out that the lift is owned by a sibling reflection issue, not this one).
```

Research complete. Document captures: single emission site at `src/engine/triage.ts:202-205`, the already-captured `lastError` string as the per-raw error source, no CLI changes needed (CLI reads only `status`), one test assertion to update at `tests/engine/triage.test.ts:505`, existing test fixtures (`makeLog`, `setupRepo`, `runAgent` stub) ready for new payload-shape tests, and three open questions for the plan step.
