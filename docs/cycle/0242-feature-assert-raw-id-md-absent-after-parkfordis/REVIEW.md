The `rename` is at `src/engine/triage.ts:717` exactly as PLAN.md states. All verification complete.

# Review: Cycle 0242

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
Single-file change: four `assert.rejects`/ENOENT insertions in `tests/engine/triage-priority.test.ts`, one per discuss-path test. Implementation precisely matches PLAN.md task specifications. All four assertions close the adversarial gap where a `copyFile`-without-`unlink` substitution would have passed silently.

### Findings
No findings.

### Spec Compliance Checklist
- [x] Add a `raw/<id>.md` absence assertion to every test in `tests/triage-priority.test.ts` that calls `parkForDiscussion` — all four discuss-path tests covered (`tests/engine/triage-priority.test.ts:203–207`, `265–269`, `336–340`, `384–388`)
- [x] Assertion strong enough that `copyFile`-without-`unlink` regression causes failure — `assert.rejects` with `{ code: "ENOENT" }` is a real FS read; BUILD.md documents manual regression check confirming 4 failures on `copyFile` substitution
- [x] All existing tests pass (`npm test`) — 710/710
- [x] Coverage floors met (`npm run test:coverage && npm run check:coverage`) — all per-file floors pass including `src/engine/triage.ts` 99.49% ≥ 95%
- [x] No compiler warnings from `npm run typecheck` — clean output

## Adversarial Test Review

### Summary
Test quality is strong. Tests use a real filesystem via `mkdtemp` — no mocking. Assertions are specific and structurally sound.

### Findings

1. **Roundtrip test ordering** (confirmed correct): Insertion 2 (`tests/engine/triage-priority.test.ts:265–269`) is placed between the `readFile(discussPath, "utf8")` existence check (line 263) and the `writeFile(rawPath, ...)` re-creation (line 272). A post-line-272 placement would produce a false-positive pass; the actual placement avoids that hazard correctly.

2. **`assert.rejects` third-arg message** (informational): All four insertions include a human-readable message string as the third argument to `assert.rejects`. This is non-standard (Node's `assert.rejects` accepts a message as the fourth argument for `(asyncFn, error, message)` form, or third when the second is a string). Specifically, `assert.rejects(asyncFn, errorLike, message)` is the three-argument form — `{ code: "ENOENT" }` is the `error` parameter and `"raw file must not exist..."` is the `message` parameter. This is valid Node assert API usage; tests pass and the message is correctly used. No defect.

### Test Coverage
- Command run: `npm run test:coverage && npm run check:coverage`
- Line / branch / function: 98.69% / 92.44% / 93.36%
- Regressions vs base (per-file): none — all per-file floors pass
- New code without tests: none — change is test-only
- Specific scenarios missing tests: none identified; all four discuss-path call sites covered

## Doc-vs-Code Claim Verification

No documentation prose changed; pass skipped.
