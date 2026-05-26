# Implementation Plan: Cycle 0257

## Overview

Update `README.md`, `BRIEF.md`, and `docs/ARCHITECTURE.md` to remove all stale rate-limit claims (exit code `42`, short/long split, "not yet emitted" caveat) and replace them with accurate descriptions of the in-process pause/retry loop shipped in cycle 0256.

## Current State (from Research)

Three documents contain the same incorrect model: "short transients back off in process; long exhaustion emits `engine.paused` and exits `42`." The architecture doc additionally has a stale JSONL schema block with wrong field name (`retry_after` → `retry_at`), a nonexistent `rate_limit.hit` event, and a caveat note stating the events are not yet emitted. The failure-modes table uses a two-row short/long split that no longer reflects the unified retry loop.

The shipped implementation (`src/engine/run-cycle.ts:334–370`) is a single `while(true)` loop that emits `engine.paused { reason: "rate_limit", retry_at }`, sleeps `engine.rate_limit_backoff_ms` (default 3,600,000 ms), and retries; it emits `engine.resumed { reason: "rate_limit_cleared" }` on first clean success. It never exits with code `42`. All six AI exec modules set `rateLimited: true`; bash steps do not. Retries are invisible to `run-one.ts` and do not increment `consecutive_failures`.

## Desired End State

- `README.md:143` — rate-limit bullet describes in-process pause/retry; no mention of exit `42`.
- `BRIEF.md:185–187` — rate-limit bullet describes `engine.paused { reason: "rate_limit" }` and in-process retry; no exit `42`.
- `docs/ARCHITECTURE.md:182` — exit-code bullet removed or corrected; `42` gone.
- `docs/ARCHITECTURE.md:210–216` — JSONL block shows `engine.paused { reason: "rate_limit", retry_at }` and `engine.resumed { reason: "rate_limit_cleared" }`; `rate_limit.hit` line removed; "not yet emitted" note removed.
- `docs/ARCHITECTURE.md:565–566` — failure-modes table has single unified rate-limit row; no exit `42`.
- `engine.rate_limit_backoff_ms` (default 3,600,000 ms) documented in at least one file.

Verification: `grep -n '42' README.md BRIEF.md docs/ARCHITECTURE.md` returns no rate-limit-related hits; `grep -n 'not yet emitted' docs/ARCHITECTURE.md` returns nothing; `npm test` passes.

## What We're NOT Doing

- No changes to `src/engine/` code or tests.
- No tightening of the `"429"` false-positive risk in `isRateLimitError` (tracked in `raw/`).
- No changes to `CLAUDE.md` or `AGENTS.md` (already accurate per SPEC).
- No documentation of features not yet built (daemon, PR creation, etc.).
- No changes to `docs/ENGINE.md` (not listed as a target in SPEC).

## Implementation Approach

Pure documentation edits — no code changes, no new tests. Three tasks, one per target file. Each task makes surgical string replacements at the exact line numbers identified in RESEARCH.md. Task order is arbitrary (no dependencies between files); they can be done in any sequence. The plan sequences them by size: README (smallest) → BRIEF → ARCHITECTURE (largest, three distinct locations).

---

## Task 1: Fix `README.md` rate-limit bullet

### Overview

Replace the single stale sentence at line 143 with accurate text describing the in-process pause/retry loop, `engine.paused`/`engine.resumed` events, and no exit `42`.

### Changes Required

**File**: `README.md`

**Current text (line 143)**:
```
- **Rate limits** are handled out of band: short transients back off in process; long exhaustion emits `engine.paused` and exits `42` for the caller to re-invoke later.
```

**Replacement**:
```
- **Rate limits** trigger an in-process pause/retry loop: the engine emits `engine.paused { reason: "rate_limit", retry_at }`, sleeps `engine.rate_limit_backoff_ms` (default 1 hour = 3,600,000 ms), and retries the same step. On first clean success after a rate-limited attempt it emits `engine.resumed { reason: "rate_limit_cleared" }`. Rate-limit retries are invisible to the consecutive-failure counter — the engine never exits on rate-limit.
```

### Success Criteria

- [ ] `grep '42' README.md` returns no rate-limit-related hits.
- [ ] `grep 'rate_limit_backoff_ms' README.md` returns one hit.
- [ ] `grep 'engine.resumed' README.md` returns one hit.
- [ ] `npm test` passes.

---

## Task 2: Fix `BRIEF.md` rate-limit bullet

### Overview

Replace the stale rate-limit bullet at lines 185–187 with accurate text matching the shipped implementation.

### Changes Required

**File**: `BRIEF.md`

**Current text (lines 185–187)**:
```
- **Rate limits** are orthogonal to attempt counting: short transients back
  off in process; long exhaustion emits `engine.paused` and exits `42` for
  the caller to re-invoke later.
```

**Replacement**:
```
- **Rate limits** are orthogonal to attempt counting: on detection the engine
  emits `engine.paused { reason: "rate_limit", retry_at }`, sleeps
  `engine.rate_limit_backoff_ms` (default 3,600,000 ms), and retries the
  same step in-process. On first clean success it emits
  `engine.resumed { reason: "rate_limit_cleared" }`. The engine never exits
  on rate-limit; retries do not increment `consecutive_failures`.
```

### Success Criteria

- [ ] `grep '42' BRIEF.md` returns no rate-limit-related hits.
- [ ] `grep 'rate_limit_cleared' BRIEF.md` returns one hit.
- [ ] `grep 'consecutive_failures' BRIEF.md` returns one hit.
- [ ] `npm test` passes.

---

## Task 3: Fix `docs/ARCHITECTURE.md` — three locations

### Overview

Three independent edits within one file: (a) the exit-code bullet in §3, (b) the JSONL rate-limit schema block in §3, and (c) the failure-modes table rows in §10.

### Changes Required

**File**: `docs/ARCHITECTURE.md`

#### 3a — Exit-code bullet (line 182)

**Current**:
```
- **Exit code.** `0` on success, `42` on rate-limit pause, non-zero on any
  other failure.
```

**Replacement**:
```
- **Exit code.** `0` on success, non-zero on failure. The engine does not
  exit on rate-limit — it retries in-process until the step succeeds or
  encounters a non-rate-limit failure.
```

#### 3b — JSONL schema block (lines 209–216)

**Current block** (the rate-limit variant lines and note below the triage block):
```jsonl
{"ts":"…","event":"rate_limit.hit"}
{"ts":"…","event":"engine.paused","reason":"rate_limit","retry_after":"…"}
```

> **Note:** `rate_limit.hit` and `engine.paused {reason: "rate_limit"}` are not yet emitted. The detection primitive `isRateLimitError` in `src/engine/rate-limit.ts` exists but wiring into exec modules and the run-cycle pause/retry loop is pending.

**Replacement** (remove `rate_limit.hit` line, fix field name, add `engine.resumed`, remove note):
```jsonl
{"ts":"…","event":"engine.paused","reason":"rate_limit","retry_at":"…"}
{"ts":"…","event":"engine.resumed","reason":"rate_limit_cleared"}
```

(No note follows — the events are shipped.)

#### 3c — Failure-modes table (lines 565–566)

**Current**:
```
| Rate limit (short) | External transient | In-process exponential backoff. No attempt consumed. |
| Rate limit (long)  | External transient | Emit `engine.paused`; exit `42`. Caller re-invokes later. |
```

**Replacement** (collapse to one row):
```
| Rate limit | External transient | Emit `engine.paused { reason: "rate_limit", retry_at }`; sleep `engine.rate_limit_backoff_ms` (default 1 h); retry same step in-process. On first clean success emit `engine.resumed { reason: "rate_limit_cleared" }`. No attempt consumed; `consecutive_failures` not incremented; engine does not exit. |
```

### Success Criteria

- [ ] `grep '42' docs/ARCHITECTURE.md` returns no rate-limit-related hits.
- [ ] `grep 'not yet emitted' docs/ARCHITECTURE.md` returns nothing.
- [ ] `grep 'rate_limit.hit' docs/ARCHITECTURE.md` returns nothing.
- [ ] `grep 'retry_after' docs/ARCHITECTURE.md` returns nothing.
- [ ] `grep 'retry_at' docs/ARCHITECTURE.md` returns at least one hit.
- [ ] `grep 'engine.resumed' docs/ARCHITECTURE.md` returns at least one hit.
- [ ] `grep 'Rate limit (long)' docs/ARCHITECTURE.md` returns nothing.
- [ ] `npm test` passes.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] README.md` rate-limit paragraph no longer mentions exit `42`; describes the in-process pause/retry loop. | Task 1 | |
| `[ ] BRIEF.md` rate-limit row in the failure-handling section no longer mentions exit `42`; describes `engine.paused { reason: "rate_limit" }` and in-process retry. | Task 2 | |
| `[ ] docs/ARCHITECTURE.md` §3 exit-code table no longer lists `42` as a rate-limit exit code (or removes the entry if the engine does not exit on rate-limit). | Task 3 (3a) | Entry is replaced, not removed; `42` is gone. |
| `[ ] docs/ARCHITECTURE.md` JSONL event schema block shows `engine.paused { reason: "rate_limit", retry_at }` and `engine.resumed { reason: "rate_limit_cleared" }` without any "not yet emitted" caveat. | Task 3 (3b) | |
| `[ ] docs/ARCHITECTURE.md` failure-modes table describes the rate-limit rows accurately (in-process pause/retry, no attempt consumed, no exit 42). | Task 3 (3c) | |
| `[ ] engine.rate_limit_backoff_ms` config key and default (3,600,000 ms) are documented in at least one of the three files. | Task 1, Task 2, Task 3 (3c) | Documented in all three. |
| `[ ] No doc claims unimplemented behavior for rate-limit detection or the retry loop. | Task 3 (3b) | "Not yet emitted" note removed; all three files describe shipped behavior. |
| `[ ] npm test` passes. | All tasks | No code changes; test suite verifies no regressions. |

---

## Testing Strategy

### Unit Tests

None required. This cycle modifies only documentation files. No new test files are created.

### Integration / E2E Tests

- Run `npm test` after all three tasks complete to confirm zero regressions.
- Manual grep verification after each task (criteria listed per task above).
- Final sweep: `grep -n '42\|not yet emitted\|rate_limit\.hit\|retry_after\|Rate limit (long)' README.md BRIEF.md docs/ARCHITECTURE.md` must return no rate-limit-related hits.

## Risk Assessment

- **Edit collateral damage**: `docs/ARCHITECTURE.md` has three distinct edit locations; accidental whitespace or list-marker changes could break surrounding formatting. Mitigation: use exact string replacement rather than line-number rewrites; verify surrounding context is unchanged.
- **`42` appears in other contexts**: grep may surface unrelated hits (e.g., cycle IDs, other exit codes). Mitigation: confirm each hit in context before declaring done.
- **`engine.resumed` already referenced elsewhere**: if the schema block already mentions `engine.resumed` for another reason, deduplication is needed. Mitigation: grep before editing confirms it does not currently appear.
