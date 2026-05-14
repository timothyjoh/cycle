Now emit REVIEW.md to stdout. Engine captures stdout to file.

```markdown
# Review: Cycle 0046

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md (2 minor test-coverage gaps; no critical issues, no production code changes required).

## Code Quality Review

### Summary
Implementation is clean, idiomatic, and faithful to SPEC. All four PLAN tasks delivered. `parseWithRepair` / `trimToLastBalancedClose` / `truncateUtf8` / `writeParseError` are small, focused, side-effect-free helpers (escalation aside) with sensible signatures. Cleanup-loop reorder lands cleanly. The schema-shape guard branch at `:57-64` is intentionally left asymmetric per SPEC §Out of Scope and PLAN §What We're NOT Doing — consistent with the existing test at `tests/engine/reflection.test.ts:427-440`.

### Findings
1. **Coverage gap (minor)**: post-repair `JSON.parse` failure path uncovered — `src/engine/reflection.ts:140-141`. No test exercises a balanced-brace span that still fails the second parse (e.g. unquoted-key JSON like `{x:1}`). See MUST-FIX Task 1.
2. **Coverage gap (minor)**: string-escape branches in `trimToLastBalancedClose` uncovered — `src/engine/reflection.ts:163,165`. No test forces the repair pass through a JSON string containing an escaped `"`. See MUST-FIX Task 2.
3. **`writeParseError` return value (cosmetic only)**: returns the bare `id` (e.g. `refl-0042-parse-error`), not the full filesystem path — consistent with the happy path at `:111` and with the `IngestResult.written: string[]` contract used elsewhere. The local variable is named `path` at `:42` which is slightly misleading; non-blocking.

### Spec Compliance Checklist
- [x] AC 1: trailing-prose JSON parses via repair pass, no skip event — pinned by `tests/engine/reflection.test.ts:168-188`.
- [x] AC 2: truly unparseable stdout emits `reflection.skipped {reason: parse_error}` and writes `raw/refl-<cid>-parse-error.md`; `cycle.end` unaffected — pinned by `:103-130`.
- [x] AC 3: repair pass invoked at most once — pinned by `:210-223` (`unbalanced braces escalate without looping`).
- [x] AC 4: > 8 KB truncated head-kept with `…` marker; under 8 KB verbatim — pinned by `:225-241` and `:243-257`.
- [x] AC 5: happy-path bare JSON + fenced-JSON tests still pass unchanged.
- [x] AC 6 (reinterpreted): in-pass slug collision against escalation is structurally unreachable (escalation runs only when zero entries parse, so `usedSlugs` is empty); replaced with resume-idempotency test at `:281-298`, which exercises the same "no duplicate parse-error file" intent. Justified in BUILD.md and PLAN.md §Resolved Open Questions point 4. Accepted.
- [x] AC 7: `src/defaults/prompts/reflection.md` includes the one-shot bad-output example after the "Discipline" section; `.cycle/prompts/reflection.md` is byte-equal (`diff -q` → no output).
- [x] AC 8: typecheck clean, no warnings.
- [x] AC 9: coverage holds — line 98.44 ≥ 95, branch 91.56 ≥ 75, function 96.32 ≥ 90. `src/engine/reflection.ts` itself: 98.35 / 94.37 / 100.00.

## Adversarial Test Review

### Summary
Strong. Zero mocks — all 22 reflection tests use real `fs` via `mkdtemp` sandboxes plus an in-memory event capture (real, not a mock). Assertions are specific (`deepEqual` on `written`/`skipped`, frontmatter field-by-field, exact byte length on truncation, ordered file lists). The new tests cover both positive (repair recovers trailing prose, leading prose, brace-in-string, multi-byte rocket boundary) and negative (unbalanced → escalation, unparseable → escalation, resume idempotency, no-loop) cases. Failure-mode coverage is honest, not just happy-path.

### Findings
1. **Missing direct coverage of repair's inner parse failure** — see Code Quality Finding 1 / MUST-FIX Task 1. The unbalanced-braces test (`:210`) exits early via the `repaired === null` shortcut, so the `(e2 as Error).message` branch at `src/engine/reflection.ts:140-141` is unexercised.
2. **Missing direct coverage of escape-aware scanning** — see Code Quality Finding 2 / MUST-FIX Task 2. The brace-in-string test at `:190-208` uses literal `{` `}` characters (no `\` escapes), so the `esc` state machine at `:163,165` never fires.
3. **Resume idempotency test is good but indirect**: `:281-298` verifies the end state (only one parse-error file remains, new body replaces stale). It does not directly assert which mechanism — cleanup-loop unlink vs `atomicWrite` rename-replace — produced the result. End-state assertion is sufficient for behavior, but a leak in the cleanup-loop reorder would be invisible if `atomicWrite`'s rename happened to clobber the stale file silently. Non-blocking; the existing `:368-384` "idempotent re-run unlinks prior refl-<cycleId>-*.md" test pins the cleanup-loop behavior in the happy-path branch, so the reorder is covered by composition.
4. **Test independence**: every test uses a fresh `mkdtemp` sandbox in `try/finally`; no shared state, no execution-order dependency. The chmod test at `:489-514` correctly restores permissions in its `finally` block.
5. **Assertion quality**: strong throughout. Byte-length assertions are exact (`Buffer.byteLength(trimmed, "utf8") === 8192`), event-shape assertions name the specific fields (`reason`, `count`, `skipped`, `field`), file-existence checks use a stat-based helper rather than `try/await readFile`. No `toBeTruthy`-style weak assertions.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function (whole repo): **98.44 / 91.56 / 96.32**
- Line / branch / function (`src/engine/reflection.ts`): **98.35 / 94.37 / 100.00**
- Regressions vs base (per-file): none. (Baselines per CLAUDE.md: line ≥ 95, branch ≥ 75, function ≥ 90 — all met.)
- New code without tests: see MUST-FIX Tasks 1-2 (two narrow branches in newly-added helpers).
- Specific scenarios missing tests: post-repair JSON.parse failure (e2 branch), backslash-escape inside JSON string within a repair-required payload. Both covered by MUST-FIX.

Total test count: **350 passing, 0 failing, 0 skipped** (was 343 on master baseline; +7 net new tests in this cycle).

End-of-turn: review complete. Two minor test-coverage gaps surfaced for fix step; MUST-FIX.md written to `docs/cycle/0046-feature-harden-ingestreflection-parsing-fence-st/MUST-FIX.md`.
