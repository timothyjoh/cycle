All checks pass. Verdict: PASS. Write REVIEW.md to stdout. No MUST-FIX needed.

```markdown
# Review: Cycle 0019

## Overall Verdict
PASS — no fixes needed.

## Code Quality Review

### Summary
Single-line, spec-faithful change. `materializeFreeformIssue` now emits `priority: 3` as the sixth RFC-001-mandated frontmatter key in documented order. The unit test was strengthened (literal `startsWith` block-assertion replaces three weak per-field regexes), locking field order as a first-class invariant. Coverage, typecheck, grep, and e2e smoke all green.

### Findings
1. **Scope creep (acceptable, doc-noted):** `tsconfig.json` was bumped `target: ES2022 → ES2023` and `lib: ["ES2023"]` added — `src/issue/materialize.ts:N/A`, `tsconfig.json:3-4`. Not in PLAN.md scope, but required to clear pre-existing `findLast` typecheck errors at `tests/cli/multi-loop.test.ts:53,114` (see memory obs 470 / 538 / 585). Node ≥ 22.6 already supports ES2023 at runtime, so zero runtime impact. BUILD.md documents the deviation. No action needed.
2. **Shared-writer fallout (intentional, doc-noted):** `src/cli.ts:62-64` (the `cycle run "<text>"` path) also goes through `materializeFreeformIssue` and therefore now emits `priority: 3`. RESEARCH.md §Dependencies and PLAN.md "What We're NOT Doing" both call this out as expected. Triage does not read `priority` (`grep "priority" src/engine/triage.ts` → no hits), so this is a forward-compatible no-op.
3. **`parseFrontmatter` round-trip verified:** `src/engine/frontmatter.ts:17` parses `^-?\d+$` to JS `number`. `priority: 3` round-trips as `3 :: number`, structurally identical to `triage_attempts: 0`.
4. **JSONL contract preserved:** `src/cli.ts:55` emits `{event:"issue.dropped", issue_id, path}` unchanged. E2E smoke confirms.

### Spec Compliance Checklist
- [x] Frontmatter contains exactly six keys in RFC-001 order: `id`, `source: text`, `title`, `added_at`, `triage_attempts: 0`, `priority: 3` — verified via e2e smoke against `dist/cycle.js`.
- [x] Default `priority` value is `3`, numeric, unquoted — verified.
- [x] Stdout JSONL `{event:"issue.dropped", issue_id, path}` unchanged — verified via e2e smoke.
- [x] No code path in `src/` writes to `docs/cycle/issues/tbd/` — `grep -rn "docs/cycle/issues/tbd" src/ tests/` returns zero.
- [x] Coverage ≥ baseline: line 96.61% ≥ 95%, branch 89.47% ≥ 75%, function 95.69% ≥ 90%. `src/issue/materialize.ts` 100% line / 100% branch / 100% function.
- [x] `npm run typecheck` clean.
- [x] No README / CLAUDE.md / RFC change required (SPEC §Documentation Updates — none of the conditional triggers fired).

## Adversarial Test Review

### Summary
**Strong.** The test was upgraded from three loose regex matches to a single literal `startsWith` block assertion that pins the entire six-field frontmatter — catches add/remove/reorder/value-shape regressions in one assertion. No mocks. Real filesystem + injected clock. The e2e in `tests/cli/multi-loop.test.ts:123` independently exercises the bundled binary against a real tmp repo.

### Findings
1. **Strong assertion shape:** `tests/issue/materialize.test.ts:21-33` uses `body.startsWith(<literal>)` against the exact byte sequence. Stronger than the prior `assert.match(body, /id: txt-.../)` which would silently tolerate field reordering or missing fields. No regex tolerance; exact byte equality.
2. **Trailing-newline assertion is orthogonal:** `tests/issue/materialize.test.ts:36` keeps the `/\nfix login bug\n$/` regex on the body tail, so frontmatter formatting changes can't accidentally swallow the body-newline contract.
3. **No mock abuse:** zero mocks. `mkdtemp` + `rm` for isolation, real `fs/promises`, clock injected as a constructor arg. Pattern matches the rest of the unit suite.
4. **E2E in multi-loop.test.ts:123-147 untouched and still green** — `npm test` 240/240 pass. It asserts path under `/docs/cycle/issues/raw/` and body contains text but does not introspect frontmatter (by design — SPEC §Testing Strategy approves leaving it lean).
5. **Untested branches: none meaningful.** The new `"priority: 3"` line is a pure constant — no branch. Title-quoting branch (`text.replace(/"/g, '\\"')`) was already exercised by the happy path with no embedded quote; coverage is 100% line / branch / function on `materialize.ts`, so a dedicated quoted-title test would be redundant for this cycle.
6. **`cycle run "<text>"` convenience path lacks a dedicated frontmatter assertion** — it goes through the same writer, so the unit test covers it, but no e2e pins the byte shape there. Low risk: it is a shared writer with one code path, and triage ignores `priority`. Acceptable; documented as expected fallout in RESEARCH §Dependencies and PLAN §"What We're NOT Doing".
7. **Test independence:** each test uses its own `mkdtemp`. No shared state, no order dependence.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: **96.61% / 89.47% / 95.69%** (baseline 95 / 75 / 90 — all clear)
- Regressions vs base (per-file): none. `src/issue/materialize.ts` at 100 / 100 / 100 (improved from prior, since the new test asserts more bytes against the same single happy path).
- New code without tests: none. The one added line (`"priority: 3"`) is asserted byte-exactly by the unit test and exercised end-to-end by `tests/cli/multi-loop.test.ts:123`.
- Specific scenarios missing tests: none required by SPEC. `--priority` override flag is explicitly deferred (SPEC §Out of Scope); no stub to test. `cycle run "<text>"` path does not have a dedicated frontmatter assertion, but is structurally identical via the shared writer (above).
```

Tests 240/240, typecheck clean, coverage 96.61/89.47/95.69 (≥95/75/90 baseline), `materialize.ts` 100/100/100, acceptance grep zero, e2e smoke against `dist/cycle.js` confirms six-field frontmatter in RFC-001 order with `priority: 3`. No MUST-FIX.md written.
