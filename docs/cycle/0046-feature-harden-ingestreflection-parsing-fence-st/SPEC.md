# SPEC — Cycle 0046: Harden ingestReflection parsing

## Objective

Make `ingestReflection` resilient to LLM stdout quirks so reflection sharp edges never get silently dropped. Add a single repair pass for trailing-prose JSON, and escalate truly unparseable stdout to a `raw/refl-<cycleId>-parse-error.md` so a human (or future triage) can recover the intent. Reinforce the JSON-only contract in `prompts/reflection.md` with a one-shot bad-output example.

## Source Issue

`refl-0021-reflection-step-emitted-invalid-json-ski` — "Harden ingestReflection parsing: fence-strip, repair pass, escalate unparsed stdout"

## Context discovered while reading

- Fence-strip is **already implemented** in `src/engine/reflection.ts:10,22-23` via `FENCE_RE`. No change needed there. The new behaviors are repair-pass + escalation + prompt hardening.
- Cycle 0020's failure (`parse error at position 2934`) is consistent with trailing prose after a balanced top-level object — the case the repair pass targets.
- Existing `prompts/reflection.md` already forbids fences and prose ("Stdout must parse as JSON on the first try"). Only the worked bad-output example is missing.

## Scope

### In Scope

1. **Repair pass on `JSON.parse` failure** in `ingestReflection` (after the existing fence-strip): trim everything after the last balanced top-level `}` (or `]` if the document starts with `[`) at depth zero, then retry `JSON.parse` exactly once. On success, continue down the normal path; on continued failure, fall through to escalation.
2. **Escalate unparsed stdout** as `docs/cycle/issues/raw/refl-<cycleId>-parse-error.md` with body = original stdout truncated to 8 KB (head-kept, trailing `…` on overflow), frontmatter `source: reflection`, `priority_hint: 7`, `origin_cycle_id: <cycleId>`. Reuse existing slug-collision suffix logic. Still emit `reflection.skipped {reason: parse_error, message}` and a final `reflection.summary`. `cycle.end` MUST NOT flip to failed.
3. **Tighten `src/defaults/prompts/reflection.md`**: add a one-shot **bad output** example (fenced JSON + trailing prose) immediately after the existing "Discipline" section, explicitly rejected. Keep the existing schema example untouched. Run `npm run sync-defaults` so the dogfood copy under `.cycle/prompts/` matches.

### Out of Scope

- Re-running the reflection agent on parse failure (no LLM retry).
- Reflection output schema versioning.
- Changes to `reflection.summary` shape.
- Multi-pass repair (only one repair attempt — keep recovery deterministic).
- Replacing `FENCE_RE` (already in place and covered by existing tests).

## Requirements

- The repair pass MUST be a pure string operation — no JSON5/lenient parsers, no regex-based JSON extraction. Find the last index where bracket-depth returns to 0 starting from the first `{` or `[` and slice up to and including that character.
- Repair MUST be skipped if no balanced close exists (depth never returns to 0). In that case go straight to escalation.
- Escalation MUST be idempotent on resume: the existing pre-write `unlink` loop for `refl-<cycleId>-*.md` already covers the parse-error file by glob, so no extra cleanup is needed — verify in tests.
- Escalation MUST be atomic (reuse `atomicWrite`).
- Stdout truncation cap: 8192 bytes measured by `Buffer.byteLength(s, "utf8")`. On overflow, keep the head and append a single `\n…\n` marker. No multi-byte character splits.
- `reflection.skipped {reason: parse_error}` MUST still be emitted on the escalation path (before or after the raw write — pick one and lock it in tests).
- Prompt change MUST be reflected in **both** `src/defaults/prompts/reflection.md` (source of truth) and `.cycle/prompts/reflection.md` (synced copy). `npm run sync-defaults` handles the copy.

## Acceptance Criteria

- [ ] JSON with trailing commentary after the closing `}` parses correctly via the repair pass and writes the normal `raw/refl-*` files (no `reflection.skipped`).
- [ ] Truly unparseable stdout (e.g. `not-json-at-all` or unbalanced braces) emits `reflection.skipped {reason: parse_error}` AND writes `raw/refl-<cycleId>-parse-error.md` containing the (truncated) original stdout, AND `cycle.end` is unaffected.
- [ ] Repair pass is invoked at most once — a second `JSON.parse` failure goes straight to escalation, not a loop.
- [ ] Stdout > 8 KB is truncated head-kept with a `…` marker; under 8 KB is captured verbatim.
- [ ] Existing happy-path test (bare JSON `sharp_edges`) and existing fenced-JSON test still pass unchanged.
- [ ] Slug-collision suffixing still applies if a real `refl-<cycleId>-parse-error` slug collides with another entry in the same pass (edge case, but covered by a test).
- [ ] `prompts/reflection.md` includes a one-shot bad-output example (fences + trailing prose) and the synced copy under `.cycle/prompts/reflection.md` matches byte-for-byte.
- [ ] All existing tests still pass; no new typecheck/lint warnings.
- [ ] Coverage does not decrease vs master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%).

## Testing Strategy

- Framework: Node's native test runner (`node --test`), the project default. Tests under `tests/engine/reflection.test.ts` (extend the existing file).
- New unit tests:
  - `parses JSON with trailing prose via repair pass` — input `{"sharp_edges":[…]} <trailing yap>`, asserts written raw files match the bare-JSON case and **no** `reflection.skipped` is emitted.
  - `escalates truly unparseable stdout` — input `not json at all`, asserts (a) `reflection.skipped {reason: parse_error}` emitted, (b) one `raw/refl-<cycleId>-parse-error.md` file written, (c) file body contains the original stdout, (d) frontmatter has `source: reflection`, `priority_hint: 7`, `origin_cycle_id: <cycleId>`.
  - `escalation truncates stdout over 8 KB` — input is 10 KB of `x`, asserts file body byte length ≤ 8192 + small marker overhead and ends with `…`.
  - `escalation slug collision suffixes` — pre-seed `raw/refl-<cycleId>-parse-error.md` to force collision via the in-pass slug set; assert the new file lands at `refl-<cycleId>-parse-error-2.md` (or document and test the actual collision shape — escalation collides with itself only when `parse-error` is also a sharp-edge title, so test by simulating a sharp-edge titled `parse error` alongside the escalation).
  - `repair pass does not loop` — input that fails both initial parse and post-repair parse; assert escalation runs exactly once.
- Regression: existing `fenced JSON parses cleanly` and `bare JSON happy path` tests remain unchanged and green.
- No E2E required (no UI surface).

## Documentation Updates

- **`src/defaults/prompts/reflection.md`**: append a one-shot bad-output example after the "Discipline" section. Re-run `npm run sync-defaults`.
- **`CLAUDE.md`**: extend the "Reflection step" bullet under "Architecture quick reference" to mention the repair pass and parse-error escalation (single sentence — this is observable engine behavior).
- **README.md**: no user-facing surface change; skip.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies

- No new packages. Pure stdlib + existing helpers (`atomicWrite`, `slugify`, `serializeFrontmatter`, `Logger`).
- No env vars, no external services.
- Requires the existing `FENCE_RE` strip path to remain in place (precondition for repair-pass ordering).
