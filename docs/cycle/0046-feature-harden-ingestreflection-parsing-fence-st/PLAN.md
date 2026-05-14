Inputs read. Open questions resolved. Plan to stdout.

```markdown
# Implementation Plan: Cycle 0046

## Overview

Harden `ingestReflection` against LLM stdout quirks: add a single-shot trailing-prose repair pass, escalate truly unparseable stdout to a `raw/refl-<cycleId>-parse-error.md` issue (with summary emission), and tighten `prompts/reflection.md` with a worked bad-output example. Fence-strip stays as-is.

## Current State (from Research)

- `src/engine/reflection.ts` is a single ~120-line function. Fence-strip already lives at `:10,21-23`. Parse-failure path at `:25-35` emits `reflection.skipped {reason:"parse_error"}` and returns early **without** emitting `reflection.summary` — that asymmetry is what SPEC §Scope §2 changes.
- Prior `refl-<cycleId>-*.md` cleanup at `:48-59` already globs the parse-error filename → resume idempotency comes for free if the escalation write happens after the cleanup loop.
- `atomicWrite` (`:130-144`), `serializeFrontmatter`, and the slug-collision suffix loop (`:82-87`) are the reusable primitives.
- Test infra: `tests/engine/reflection.test.ts` uses `setupRepo()` + `makeLogger()`. Two existing parse-error regressions (`:103-117`, `:134-146`) MUST be rewritten — under the new behavior both inputs now write a parse-error raw and emit a `reflection.summary`.
- Default prompt drift: `src/defaults/prompts/reflection.md` is source of truth; `npm run sync-defaults` copies it into `.cycle/prompts/`. Currently byte-equal.

## Desired End State

- `ingestReflection(repoRoot, cycleId, slug, stdout, log)` handles three input shapes deterministically:
  1. **Valid JSON** (bare or fenced) → existing happy path, no behavior change.
  2. **Valid JSON followed by trailing prose** → repair pass trims to last balanced top-level close brace, re-parses once, joins happy path. No `reflection.skipped`.
  3. **Unparseable stdout** (or repair-pass-still-fails) → write `raw/refl-<cycleId>-parse-error.md` (truncated to 8192 UTF-8 bytes head-kept with `\n…\n` marker on overflow), emit `reflection.skipped {reason:"parse_error", message}` then `reflection.summary {count:0, skipped:1}`. `cycle.end` unaffected.
- `prompts/reflection.md` (both source-of-truth and synced copy) contains a one-shot bad-output example immediately after the "Discipline" section, byte-for-byte equal across the two files.
- `CLAUDE.md` "Reflection step" bullet mentions repair pass + parse-error escalation.
- Coverage holds at master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%). All 343 prior tests stay green; new tests added.

Verification:
- `npm run typecheck` clean.
- `npm test` green; coverage report shows no regression.
- `diff -q src/defaults/prompts/reflection.md .cycle/prompts/reflection.md` → no output.
- New tests cover: repair-pass-trailing-prose, escalation-unparseable, escalation-truncation, escalation-idempotency-on-resume, repair-pass-does-not-loop.

## What We're NOT Doing

- **No LLM retry** of the reflection agent on parse failure (SPEC §Out of Scope).
- **No JSON5 / lenient parsers** — repair is pure string scanning only.
- **No multi-pass repair** — one shot, then escalate.
- **No change to `FENCE_RE`** — it stays anchored as-is; leading-prose-before-fence still flows through to escalation (covered by rewritten test).
- **No change to the schema-shape guard branch at `:37-44`** — that branch keeps its current asymmetric "no summary" behavior; SPEC §Scope only addresses the post-`JSON.parse` failure path. Out of scope.
- **No reflection schema versioning** (SPEC §Out of Scope).
- **No `reflection.summary` shape change** — same `{cycle_id, count, skipped}`.
- **No new slug-collision test against escalation alone** — the escalation path runs only when `JSON.parse` fails twice, which means zero parsed entries → no in-pass `usedSlugs` collision is reachable. Task 2 explains the structural argument and the resume-idempotency test stands in for the collision case.

## Implementation Approach

Resolve the six RESEARCH open questions up front, then implement in four tasks (three code + one docs):

**Resolved open questions:**

1. **Escalation file title** → `"reflection stdout failed to parse"` (lowercased, plain).
2. **Skipped-vs-write ordering** → write parse-error file → emit `reflection.skipped` → emit `reflection.summary`. (Write completes before any event so any observer reacting to the event sees the file on disk.)
3. **`reflection.summary` on escalation path** → emit it. This is a behavior change vs current code. Existing parse-failure regression tests must be updated to expect the summary plus the new raw file. Schema-shape branch (`:37-44`) stays unchanged (out of scope).
4. **Collision-suffix test** → not implementable in a meaningful way (escalation only runs when zero entries are parsed, so the in-pass `usedSlugs` Set is empty). Replace with a resume-idempotency test: pre-seed `raw/refl-<cycleId>-parse-error.md` → run → assert only one parse-error file remains (the cleanup loop deletes the seed, escalation writes the new one).
5. **`usedSlugs` ordering with escalation** → escalation is a strictly separate code path that does not touch `usedSlugs`. Resolved by SPEC's structural argument.
6. **8 KB truncation cap shape** → budget total file body to **exactly 8192 UTF-8 bytes** when overflow occurs. Algorithm: walk the original stdout codepoint-by-codepoint, accumulating UTF-8 byte length, stopping before adding the next codepoint would exceed `8192 - byteLength("\n…\n")` = `8187`. Append `\n…\n` (5 bytes). Final body byte length === 8192 for overflow inputs; ≤ 8192 verbatim for under-cap inputs.

**Structure of `reflection.ts` after the change** (rough sketch, locked by tests):

```ts
const FENCE_RE = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/;
const TRUNC_BUDGET = 8192;
const TRUNC_MARKER = "\n…\n";

function parseWithRepair(s: string): { ok: true; value: unknown } | { ok: false; message: string } {
  try { return { ok: true, value: JSON.parse(s) }; } catch (e1) {
    const repaired = trimToLastBalancedClose(s);
    if (repaired === null) return { ok: false, message: (e1 as Error).message };
    try { return { ok: true, value: JSON.parse(repaired) }; }
    catch (e2) { return { ok: false, message: (e2 as Error).message }; }
  }
}

function trimToLastBalancedClose(s: string): string | null {
  // find first '{' or '['; scan once tracking depth (string-aware); record last index
  // where depth returns to 0; slice [start..lastIdx]; null if depth never hits 0.
}

function truncateUtf8(s: string, budget = TRUNC_BUDGET, marker = TRUNC_MARKER): string {
  // byteLength check; codepoint-walk if over.
}

async function writeParseError(repoRoot, cycleId, stdout): Promise<string> { /* atomicWrite */ }
```

The top of `ingestReflection` becomes:

```ts
const stripped = (FENCE_RE.exec(raw.trim())?.[1] ?? raw.trim());
const parsed = parseWithRepair(stripped);
if (!parsed.ok) {
  const path = await writeParseError(repoRoot, cycleId, stdout); // original, not stripped
  log.emit("reflection.skipped", { cycle_id: cycleId, reason: "parse_error", message: parsed.message });
  log.emit("reflection.summary", { cycle_id: cycleId, count: 0, skipped: 1 });
  return { written: [path], skipped: 1 };
}
// continue with parsed.value — existing schema-shape guard + entry loop unchanged
```

The cleanup loop at `:48-59` runs **before** `parseWithRepair` (move it ahead of the parse, or — simpler — only call `writeParseError` after the cleanup runs). Decision: move the cleanup loop to the top of the function, before any parse attempt, so both the happy path and the escalation path get idempotent prior-file removal. This is a refactor; existing tests pin behavior, so we rely on them as the regression net.

Actually simpler: keep cleanup where it is, run it before `parseWithRepair`. Concretely, reorder so cleanup precedes parse. Either is fine; tests pin it.

---

## Task 1: Add `parseWithRepair` + repair pass behavior

### Overview

Add a single-shot trailing-prose repair pass. After `FENCE_RE` strip, try `JSON.parse`; on failure, trim to the last balanced top-level close brace/bracket at depth zero (string-aware) and retry exactly once. On second failure, fall through to the existing skip path (Task 2 changes that path to escalate).

### Changes Required

**File**: `src/engine/reflection.ts`

**Changes**:

- Introduce `parseWithRepair(s)` helper returning `{ok, value}|{ok:false, message}`.
- Introduce `trimToLastBalancedClose(s)` helper:
  - Find the first `{` or `[` in `s`. If none, return `null`.
  - Walk forward, tracking string state (`"`, escape via preceding `\`), depth (+/− on `{` `}` `[` `]` outside strings).
  - Record `lastIdx` whenever depth transitions to 0 after being > 0.
  - Return `s.slice(0, lastIdx + 1)` if `lastIdx >= 0`, else `null`.
- Replace the existing `JSON.parse(stripped)` try/catch at `:25-35` with `parseWithRepair(stripped)`.
- On `!ok` keep current behavior **for this task** (emit skipped, return early). Task 2 rewrites this branch.

**File**: `tests/engine/reflection.test.ts`

**New unit tests**:

- `parses JSON with trailing prose via repair pass` — input `'{"sharp_edges":[{"title":"A","body":"b","priority_hint":3}]}\nHere is some prose'` → asserts one `refl-<cycleId>-a.md` file written, NO `reflection.skipped` emitted, `reflection.summary {count:1, skipped:0}` emitted.
- `repair pass handles trailing prose after array close` — same shape but using `[...]` at top level (defensive, even though current schema uses an object; keeps the helper robust).
- `repair pass returns null on unbalanced braces` — internal helper test via small additional export OR inferred through the integration test in Task 2.

### Success Criteria

- [ ] `npm run typecheck` clean.
- [ ] `npm test` green; existing happy-path test (bare JSON) and fenced-JSON test still pass unchanged.
- [ ] New `trailing prose via repair pass` test passes.
- [ ] No `reflection.skipped` emitted on repair-pass success.
- [ ] Repair-pass codepath instrumentation can be verified by reading the test's `events` array (1 `reflection.surfaced` + 1 `reflection.summary`).

---

## Task 2: Escalation path — write `refl-<cycleId>-parse-error.md` on continued failure

### Overview

Rewrite the post-repair-fail branch to: write a parse-error raw file → emit `reflection.skipped {reason:"parse_error", message}` → emit `reflection.summary {count:0, skipped:1}`. Cleanup-loop ordering guarantees idempotency on resume.

### Changes Required

**File**: `src/engine/reflection.ts`

**Changes**:

- Move the prior `refl-<cycleId>-*.md` cleanup loop (currently at `:48-59`) to run **before** the parse attempt, so escalation benefits from the same cleanup. Alternative: leave it where it is and add a duplicate cleanup before `writeParseError`. Pick the former — single source of cleanup, fewer surfaces.
- Add `writeParseError(repoRoot, cycleId, stdout)` helper:
  - Compute `slug = "parse-error"`; final filename `refl-${cycleId}-parse-error.md`.
  - Build frontmatter (same shape as normal reflection raws):
    ```ts
    {
      id: `refl-${cycleId}-parse-error`,
      source: "reflection",
      title: "reflection stdout failed to parse",
      added_at: new Date().toISOString(),
      triage_attempts: 0,
      priority_hint: 7,
      origin_cycle_id: cycleId,
    }
    ```
  - Body = `truncateUtf8(stdout)` (Task 3 adds the helper; for now, write raw `stdout` and Task 3 layers truncation on top — or land them together; recommended: land truncation in same task to keep the test green).
  - Use `serializeFrontmatter(fm, "\n" + body + "\n")` and `atomicWrite(path, content)`.
  - Return the written path.
- Rewire `ingestReflection` failure branch:
  ```ts
  if (!parsed.ok) {
    const path = await writeParseError(repoRoot, cycleId, raw);
    log.emit("reflection.skipped", { cycle_id, reason: "parse_error", message: parsed.message });
    log.emit("reflection.summary", { cycle_id, count: 0, skipped: 1 });
    return { written: [path], skipped: 1 };
  }
  ```
  Note: `raw` here is the **original stdout**, not the post-fence-strip `stripped` — preserve the original signal for human triage.

**File**: `tests/engine/reflection.test.ts`

**Changes**:

- **Rewrite** existing `parse failure on invalid JSON` test (`:103-117`): input `"not json at all"` now MUST assert:
  - One `reflection.skipped {reason:"parse_error"}` event.
  - One `reflection.summary {count:0, skipped:1}` event.
  - `raw/refl-<CID>-parse-error.md` exists with frontmatter `{source:"reflection", priority_hint:7, origin_cycle_id:CID, title:"reflection stdout failed to parse", id:"refl-<CID>-parse-error", triage_attempts:0}`.
  - Body contains `"not json at all"`.
- **Rewrite** existing `leading prose before fence` test (`:134-146`): input `"Here is the output:\n\`\`\`json\n{...}\n\`\`\`"` now expects the escalation path (fence regex won't match because of leading prose; repair pass also fails because the input contains no balanced top-level `{...}` slice from depth 0 — the JSON is nested inside the codeblock fence string). Assert same shape as above.
- **New test**: `escalation is idempotent on resume` — pre-seed `raw/refl-<CID>-parse-error.md` with stale body `"old"`, run `ingestReflection` with unparseable stdout, assert:
  - Only one `refl-<CID>-parse-error.md` exists.
  - Its body contains the new stdout, not `"old"`.
- **New test**: `repair pass does not loop` — input `{"sharp_edges":[}` (unbalanced) → assert escalation runs exactly once (single `reflection.skipped` event, single `parse-error.md` written, exactly one `reflection.summary`).

### Success Criteria

- [ ] `npm run typecheck` clean.
- [ ] All updated and new tests pass; pre-existing happy/fenced tests still pass.
- [ ] `raw/refl-<cycleId>-parse-error.md` written via `atomicWrite` (no partial files on crash — verified by code inspection, not test).
- [ ] `reflection.summary` is emitted on the escalation path (current code does NOT emit it — behavior change is locked by test).
- [ ] `cycle.end` flow upstream unaffected (verified by code inspection of `run-cycle.ts:148-149` — caller ignores return value).
- [ ] No `reflection.skipped` emitted on the repair-pass success path (negative assertion in Task 1's test stands).

---

## Task 3: 8 KB UTF-8 truncation for parse-error body

### Overview

Truncate stdout to `≤ 8192` UTF-8 bytes when writing to the parse-error raw. Codepoint-safe walk; append `\n…\n` marker on overflow.

### Changes Required

**File**: `src/engine/reflection.ts`

**Changes**:

- Add `truncateUtf8(s, budget = 8192, marker = "\n…\n")` helper:
  ```ts
  function truncateUtf8(s: string, budget = 8192, marker = "\n…\n"): string {
    if (Buffer.byteLength(s, "utf8") <= budget) return s;
    const markerBytes = Buffer.byteLength(marker, "utf8"); // 5
    const cap = budget - markerBytes; // 8187
    let acc = 0;
    let cut = 0;
    for (const ch of s) {
      const n = Buffer.byteLength(ch, "utf8");
      if (acc + n > cap) break;
      acc += n;
      cut += ch.length; // UTF-16 code-unit length
    }
    return s.slice(0, cut) + marker;
  }
  ```
- Wire into `writeParseError`: `const body = truncateUtf8(stdout);`.

**File**: `tests/engine/reflection.test.ts`

**New tests**:

- `escalation truncates stdout over 8 KB`:
  - Build `stdout = "x".repeat(10000)` (definitely unparseable).
  - Run `ingestReflection`.
  - Read `raw/refl-<CID>-parse-error.md`, strip frontmatter, assert:
    - `Buffer.byteLength(body, "utf8") === 8192`.
    - `body.endsWith("\n…\n")`.
- `escalation preserves short stdout verbatim`:
  - `stdout = "garbage"` → body strictly contains `"garbage"`, no marker.

### Success Criteria

- [ ] Both new truncation tests pass.
- [ ] Helper is codepoint-safe (no multi-byte split). Verified by an additional spot test using a multi-byte char near the boundary, e.g. `"a".repeat(8190) + "🚀"` (rocket = 4 bytes UTF-8); body byte length must still be exactly 8192 and must not contain a half-rocket.
- [ ] Helper is pure (no fs access); can be unit-tested directly if exported, or via integration through the escalation test above.

---

## Task 4: Prompt hardening + sync-defaults + CLAUDE.md

### Overview

Add a one-shot bad-output example to `src/defaults/prompts/reflection.md`, sync to `.cycle/prompts/`, update CLAUDE.md "Reflection step" bullet.

### Changes Required

**File**: `src/defaults/prompts/reflection.md`

**Changes**: After the existing "Discipline" section, insert (with surrounding blank lines):

```markdown
### Bad output (rejected)

Do NOT do this:

​```
Here is the analysis you requested:

​```json
{ "sharp_edges": [ { "title": "x", "body": "y", "priority_hint": 3 } ] }
​```

Hope that helps!
​```

The engine will treat this as a parse error and escalate. Output JSON only — no fences, no leading prose, no trailing prose.
```

(Backticks shown as `​```` above for display; real file uses actual triple-backticks.)

**File**: `.cycle/prompts/reflection.md`

**Changes**: Regenerated by `npm run sync-defaults` (script copies from `src/defaults/`).

**File**: `CLAUDE.md`

**Changes**: Extend the "Reflection step:" bullet (`CLAUDE.md:52` per RESEARCH) — change end of bullet from `…(`-2`, `-3`, …).` to add: ` On parse failure, the engine first tries a single trailing-prose repair pass; on continued failure it escalates the truncated stdout to `raw/refl-<cycleId>-parse-error.md` (`source: reflection`, `priority_hint: 7`) and still emits `reflection.summary`.`

### Success Criteria

- [ ] `diff -q src/defaults/prompts/reflection.md .cycle/prompts/reflection.md` → no output (byte-equal after sync).
- [ ] CLAUDE.md change is a single sentence appended to the existing Reflection bullet, no other prose churn.
- [ ] `npm test` still green (prompt content is not asserted by any test; mechanical change).

---

## Testing Strategy

### Unit Tests

- **Repair pass success**: trailing prose after closing `}` → parses; no skip event.
- **Repair pass null**: unbalanced braces (e.g. `{"foo":` ) → escalation runs; one skip event.
- **Escalation file shape**: frontmatter (`source`, `priority_hint:7`, `origin_cycle_id`, `id`, `title`, `triage_attempts:0`, `added_at`) and body content.
- **Truncation over budget**: `"x".repeat(10000)` → body exactly 8192 bytes, ends with `\n…\n`.
- **Truncation under budget**: short stdout verbatim.
- **Truncation multi-byte boundary**: `"a".repeat(8190) + "🚀"` → no half-rocket; total 8192 bytes.
- **Idempotency on resume**: pre-seeded parse-error file is replaced, not duplicated.
- **Repair pass does not loop**: unbalanced input → exactly one escalation, no recursive parse attempts.
- **Summary always emits on escalation**: regression for the SPEC behavior change.

**Mocking strategy**: zero mocks. All tests use real `fs` via `mkdtemp` sandbox (existing `setupRepo()` pattern). The only "fake" is `makeLogger()` which captures events in-memory — that's a real event-capture, not a mock.

### Integration / E2E Tests

- None required. `ingestReflection` is called from `run-cycle.ts` as a fire-and-forget side effect; existing run-cycle integration tests do not exercise this path with broken stdout, and SPEC §Testing explicitly says "No E2E required".

### Regression coverage

- Existing `bare JSON happy path` (`tests/engine/reflection.test.ts` happy path) — unchanged, must stay green.
- Existing `fenced JSON parses cleanly` (`:119-132`) — unchanged.
- Existing `parse failure on invalid JSON` (`:103-117`) — **rewritten** to assert new behavior (escalation + summary).
- Existing `leading prose before fence` (`:134-146`) — **rewritten** same.
- Existing `validateEntry` and slug-collision tests — unaffected (escalation does not flow through `validateEntry` or `usedSlugs`).

### Coverage

- New helpers (`parseWithRepair`, `trimToLastBalancedClose`, `truncateUtf8`, `writeParseError`) are 100% covered by the new tests above.
- Existing baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%) maintained — new code lands with tests in same cycle.

## Risk Assessment

- **Risk**: `trimToLastBalancedClose` mis-handles JSON strings containing literal `{` / `}` / `[` / `]`.
  - **Mitigation**: string-aware scanner (track `"` open/close with `\` escape). Test with an input like `{"sharp_edges":[{"title":"a {b} c","body":"y","priority_hint":3}]}<trailing prose>` — must still parse via repair.
- **Risk**: Behavior change (now emitting `reflection.summary` on escalation) breaks an external consumer.
  - **Mitigation**: no external consumers — `reflection.summary` is only consumed by humans reading `log.jsonl`. SPEC explicitly mandates this change.
- **Risk**: 8 KB truncation produces invalid UTF-8 if helper is wrong.
  - **Mitigation**: codepoint-walk via `for...of` (which iterates by Unicode codepoint, not UTF-16 code unit), plus multi-byte boundary test.
- **Risk**: Cleanup loop reorder (moving above parse) breaks an existing assumption.
  - **Mitigation**: existing tests pin the cleanup behavior (`tests/engine/reflection.test.ts` covers prior-file removal on resume); they stay green or the reorder is wrong. If a test fails, revert reorder and instead duplicate the cleanup just before `writeParseError`.
- **Risk**: `sync-defaults` script silently no-ops if `.cycle/` is missing.
  - **Mitigation**: `scripts/sync-defaults.mjs` does `rm -rf` + `cp -r`, so it creates the dir. Verify via `diff -q` post-run as part of Task 4 success criteria.
- **Risk**: Prompt change drifts because forgot `npm run sync-defaults`.
  - **Mitigation**: Task 4 success criterion is the `diff -q` byte-equality check; commit fails review otherwise.
```

Plan written to stdout. Engine captures.
