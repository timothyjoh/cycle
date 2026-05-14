Verify done. Run quality + adversarial review.

```markdown
# Review: Cycle 0043

## Overall Verdict
PASS — no fixes needed.

## Code Quality Review

### Summary
Test-only cycle. Adds one e2e test pinning the `cycle run "<text>" --dry-run` raw-issue frontmatter byte-shape (including `priority: 3` default). Implementation matches PLAN.md Task 1 verbatim, scope held to SPEC (no production change, no helper extraction). Patterns mirror the neighboring `drop` test. Quality gates green.

### Findings
1. **Scope discipline**: Test-only, no production code touched — matches SPEC's explicit out-of-scope list (no Option B refactor, no `--priority` on `run`, no default change) — `tests/cli/multi-loop.test.ts:149-197`.
2. **Pattern fidelity**: New test mirrors `'drop' materializes ...` test structure (mkdtemp + ensureDist + spawnSync + rm-in-finally), keeping the two sibling tests lockstep — `tests/cli/multi-loop.test.ts:123-147` vs `:149-197`.
3. **Assertion strength**: Byte-exact prefix match on the full 6-field frontmatter block (`id`, `source: text`, `title`, `added_at`, `triage_attempts: 0`, `priority: 3`), strictly stronger than the requirement-level "assert `priority: 3`" check in SPEC AC — `tests/cli/multi-loop.test.ts:175-187`.
4. **Time-dependent fields**: `added_at` and `id` timestamp are handled correctly — shape-pinned via separate regex (`tests/cli/multi-loop.test.ts:167-171`), value-substituted into the byte-prefix from the observed line. Avoids flake.
5. **Cleanup**: `rm(root, { recursive: true, force: true })` in `finally` — safe under failure paths.

### Spec Compliance Checklist
- [x] New test in `tests/cli/multi-loop.test.ts`
- [x] Asserts `priority: 3` in frontmatter
- [x] Asserts `source: text` and body matches text
- [x] Fails if `materializeFreeformIssue` is bypassed on `run "<text>"` path (any divergent writer → different bytes)
- [x] Fails if default priority on `run` path changes away from 3
- [x] `npm test` passes — 343/343
- [x] `npm run typecheck` clean — no warnings
- [x] `npm run test:coverage` passes thresholds — line 98.55%, branch 91.57%, func 96.23%
- [x] No doc updates required (test-only cycle against shipped behavior) — confirmed N/A per SPEC

## Adversarial Test Review

### Summary
Strong. No mocks. Real spawn against real `dist/cycle.js`, real temp repo, real `readdir` + `readFile`. Byte-exact frontmatter match is the strongest form of pin. Single-scenario coverage is correct given SPEC's narrow scope ("pin byte-shape on the `run "<text>"` path").

### Findings
1. **No mock abuse**: 0% mocking. End-to-end through the real binary. Cannot test "the mock" — there is none.
2. **Happy path only — by design**: SPEC explicitly defines one scenario; failure paths (invalid text, missing dirs, escape handling) are out of scope and already covered at the unit level by `tests/issue/materialize.test.ts`.
3. **Assertion specificity**: `body.startsWith(expectedFrontmatter)` with the full 6-line block — beats any regex-per-field approach for catching field reorder/rename. `assert.match(filename, /^txt-\d{8}-\d{6}-park-this-too\.md$/)` pins id format + slug truncation.
4. **Body tail check**: `assert.match(body, /\npark this too\n$/)` pins the trailing newline contract from `materialize.ts:23-26` (`["---", "", text, ""].join("\n")`).
5. **No execution-order coupling**: `mkdtemp` gives each test its own root; no shared global state. Independent.
6. **Minor — `r.status` message includes only `stderr`**: error message at `tests/cli/multi-loop.test.ts:159` doesn't include `r.stdout` for diagnostics on non-zero exit. Not a correctness defect; just a debug-quality nit if the binary fails on future changes. Not worth a fix.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: **98.55% / 91.57% / 96.23%** (baseline: 95 / 75 / 90 — all clear)
- Regressions vs base (per-file): **none**. `src/issue/materialize.ts` 100/100/100. `src/issue/id.ts` 100/100/100. Other files unchanged from cycle 0042 baseline.
- New code without tests: **none** — diff is test-only.
- Specific scenarios missing tests: none in scope. Out-of-scope (per SPEC) and already covered elsewhere: title-quote-escape (handled at unit level via `materialize.ts:19` and `tests/issue/materialize.test.ts`), explicit `--priority` value on `drop` (cycle 0042 tests), `run` engine-loop integration (existing multi-loop tests).
```

PASS verdict. No MUST-FIX.md written.
