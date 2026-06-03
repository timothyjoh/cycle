# Review: Cycle 0040

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md (1 minor issue; the core feature is correct, fully tested, and documented)

## Code Quality Review

### Summary
The resume/verify-only `touched.json` recovery is implemented cleanly and matches the SPEC and PLAN intent: a shared `parseTouchedFilesSection` parser, a self-contained best-effort `recoverTouchedFiles` helper, and a tight resume-gated call site. Failure handling is exemplary — every degrade path emits an observable event, the helper never throws, and the caller wraps it as belt-and-suspenders. One unintended behavioral divergence was introduced in the *non-resume* path by the parser extraction, violating the "byte-for-byte unchanged" requirement.

### Findings
1. **Spec deviation (normal path)**: The parser extraction changed `appendDocumentationPaths`'s early-return from `if (headerIdx === -1) return;` to `if (touchedSet.size === 0) return;` — `src/engine/run-cycle.ts:134`. The new guard also short-circuits when `## Touched Files` is present but has no bullets, disabling the auto-append safety net for that under-reporting case. Old behavior fell through and appended discovered paths. SPEC.md:37 requires the normal path be byte-for-byte unchanged; PLAN.md:90 explicitly directed preserving the `headerIdx === -1` guard. Untested. → MUST-FIX Task 1.
2. **Idempotency (correct)**: `recoverTouchedFiles` guards on a non-empty `files` array (`src/engine/run-cycle.ts:211`) — re-runs after success are event-less no-ops; corrupt/empty `touched.json` correctly falls through to recovery.
3. **Fail-safe (correct)**: non-zero `git status` contributes an empty current set but does not abort (`src/engine/run-cycle.ts:221`), preserving `BUILD.md`-declared paths on the clean-tree verify-only path. `spawnSync` with `shell:false`, array args.
4. **No silent failure (correct)**: every exit except the documented populated-guard no-op emits exactly one event (`touched.recovered` / `touched_recovery_empty` / `touched_recovery_write_failed`).

### Spec Compliance Checklist
- [x] AC1 — resume past build produces non-empty `touched.json` from `BUILD.md` `## Touched Files` (integration test, `run-cycle.touched-recovery.test.ts:268`)
- [x] AC2 — verify-only clean-tree path still populates from declared set (`:99`)
- [x] AC3 — `touched.recovered { cycle_id, source, count }` emitted exactly once (cardinality-pinned via `expectExactlyOne`)
- [x] AC4 — no recoverable footprint → file unchanged + one `touched_recovery_empty` (`:126`, `:144`)
- [x] AC5 — already-populated `touched.json` is a no-clobber no-op, no event (`:163`)
- [x] AC6 — normal build path emits no new event, writes `touched.json` as before (`:324`)
- [x] AC7 — all existing tests pass (1066 pass / 0 fail)
- [x] AC8 — `npm run typecheck` clean
- [~] SPEC.md:37 "normal path byte-for-byte unchanged" — violated for the present-but-empty-header case (Finding 1)
- [x] SPEC→PLAN traceability present in PLAN.md (`## SPEC Acceptance Traceability`, every AC bullet re-quoted verbatim with covering task)
- [x] SPEC has a populated `## Acceptance Criteria` section with testable bullets
- [x] Docs updated — `docs/ENGINE.md:228`, `CLAUDE.md:83`

### Benefit delivery
CONCRETE USER BENEFIT verified end-to-end: an operator resuming past the build step gets a `touched.json` reconstructed from the build's declared footprint, and the log records `touched.recovered { source: "BUILD.md", count }`. The integration test (`:268`) exercises the real `runCycle` resume path and asserts the populated file plus the event. Benefit is genuinely realizable.

## Adversarial Test Review

### Summary
Strong. Real temp git repos and real filesystem throughout — no mocks of the code under test; the only injected seam is a thin in-memory `Logger`. Every branch of `recoverTouchedFiles` has a dedicated test, including the three degrade paths and the `git status` non-zero path (via a non-repo cwd). Assertions are specific (`deepEqual` on file contents, exact `reason`/`source`/`count`).

### Findings
1. **Coverage gap (minor)**: No test seeds a `## Touched Files` header that is present but empty, so the Finding-1 divergence slipped through — `tests/engine/run-cycle.documentation.test.ts` only covers header-with-bullets and no-header. Add per MUST-FIX Task 1.
2. **Robust write-failure test**: uses a directory-at-target (EISDIR) instead of `chmod 0o555` — correctly avoids the root-bypasses-chmod pitfall (`run-cycle.touched-recovery.test.ts:183`, documented in BUILD.md).
3. **Cardinality pinning (correct)**: `touched.recovered` asserted with `expectExactlyOne` in unit tests and `filter(...).length === 1` in the integration test (`:316`).
4. **Boundary cases covered**: `isDenied` exclusion (`:204`), git-status-nonzero (`:227`), already-populated no-clobber (`:163`), bullet whitespace trimming (`:51`), stop-at-next-`##` (`:61`).

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function (`src/engine/run-cycle.ts`): 100.00% / 97.47% / 96.30%
- Regressions vs base (per-file): none — coverage gate exit 0 across all floored files
- New code without tests: none for the recovery feature; the `appendDocumentationPaths` empty-header path (Finding 1) is the one untested behavior, and it is a regression rather than new code
- Specific scenarios missing tests: present-but-empty `## Touched Files` header in `appendDocumentationPaths` (MUST-FIX Task 1)

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `recoverTouchedFiles(repoRoot, artifactDir, log, cycleId)` invoked once before the step loop | `docs/ENGINE.md:228` | `src/engine/run-cycle.ts:393` (call), `:196` (def) | OK |
| Triggers when `maxResetIdx >= 0 && startIdx > maxResetIdx` | `CLAUDE.md:83` | `src/engine/run-cycle.ts:387,391` | OK |
| Shared `parseTouchedFilesSection` parser also used by `appendDocumentationPaths` | `CLAUDE.md:83` | `src/engine/run-cycle.ts:110` (def), `:133` (reuse) | OK |
| Emits `touched.recovered { cycle_id, source: "BUILD.md", count }` | `docs/ENGINE.md:228` | `src/engine/run-cycle.ts:238` | OK |
| `engine.warning { reason: "touched_recovery_empty" }` when nothing recoverable | `docs/ENGINE.md:228` | `src/engine/run-cycle.ts:228` | OK |
| `engine.warning { reason: "touched_recovery_write_failed" }` on write error | `docs/ENGINE.md:228` | `src/engine/run-cycle.ts:235` | OK |
| Never clobbers an already-non-empty `touched.json` (silent no-op) | `CLAUDE.md:83` | `src/engine/run-cycle.ts:211` | OK |
| Both sources `isDenied`-filtered | `docs/ENGINE.md:228` | `src/engine/run-cycle.ts:224` | OK |
| Non-zero `git status` contributes empty set but does not abort | `docs/ENGINE.md:228` | `src/engine/run-cycle.ts:221` | OK |
| Normal (non-resume) build path triggers no new spawn | `CLAUDE.md:83` | `src/engine/run-cycle.ts:386` (gated on `opts.resume`) | OK |

All in-scope documentation prose changes (`CLAUDE.md`, `docs/ENGINE.md`) are backed by real `file:line` references at HEAD. No unbacked claims.
