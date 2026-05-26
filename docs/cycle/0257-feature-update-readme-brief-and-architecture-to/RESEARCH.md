# Research: Cycle 0257

## Cycle Context

Cycle 0257 updates `README.md`, `BRIEF.md`, and `docs/ARCHITECTURE.md` to match the rate-limit behavior shipped in cycle 0256. The three documents currently describe a split "short/long" rate-limit model where long exhaustion emits `engine.paused` and exits with code `42`. Cycle 0256 replaced that with an in-process pause/retry loop that never exits — the engine emits `engine.paused { reason: "rate_limit", retry_at }`, sleeps a configurable backoff, retries the same step, and emits `engine.resumed { reason: "rate_limit_cleared" }` on first clean success. All three documents must be brought into alignment with this shipped behavior, with no remaining references to exit code `42` or to the retry loop as unimplemented.

---

## Current Codebase State

### Stale Text in Target Documents

**`README.md:143`**
```
Rate limits are handled out of band: short transients back off in process; long exhaustion emits `engine.paused` and exits `42` for the caller to re-invoke later.
```
This is incorrect. The engine does not exit on rate-limit.

**`BRIEF.md:185–187`** (under "Branching, commit, and failure handling")
```
Rate limits are orthogonal to attempt counting: short transients back off in process; long exhaustion emits `engine.paused` and exits `42` for the caller to re-invoke later.
```
Same error.

**`docs/ARCHITECTURE.md:182`** (§3 Invocation Contract, exit-code bullet)
```
Exit code. `0` on success, `42` on rate-limit pause, non-zero on any other failure.
```
Exit code `42` is not emitted on rate-limit; the engine does not exit.

**`docs/ARCHITECTURE.md:210–216`** (§3 JSONL event schema, "Triage-failure and rate-limit variants" block)
```jsonl
{"ts":"…","event":"rate_limit.hit"}
{"ts":"…","event":"engine.paused","reason":"rate_limit","retry_after":"…"}
```
> **Note:** `rate_limit.hit` and `engine.paused {reason: "rate_limit"}` are not yet emitted. The detection primitive `isRateLimitError` in `src/engine/rate-limit.ts` exists but wiring into exec modules and the run-cycle pause/retry loop is pending.

Three errors here: (1) `rate_limit.hit` is never emitted; (2) the field is `retry_at`, not `retry_after`; (3) the "not yet emitted" caveat is false — both events are now emitted.

**`docs/ARCHITECTURE.md:565–566`** (§10 failure modes table)
```
| Rate limit (short) | External transient | In-process exponential backoff. No attempt consumed. |
| Rate limit (long)  | External transient | Emit `engine.paused`; exit `42`. Caller re-invokes later. |
```
The short/long split and exit `42` are both wrong. There is one unified in-process retry loop.

---

### Relevant Components (Shipped Implementation)

**`src/engine/rate-limit.ts:1–14`** — `isRateLimitError(result: ExecResult): boolean`
- Returns `true` if `exitCode === 429`.
- Returns `true` if `exitCode === 1` AND the combined `stderr + stdout` (lowercased) contains any of `["rate limit", "429", "too many requests"]`.
- Returns `false` for all other cases.
- Note: CLAUDE.md documents a known false-positive risk for the bare `"429"` substring pattern on exit 1 when unrelated output contains that digit sequence.

**`src/engine/exec-bash.ts:6–11`** — `StepResult` type definition
```typescript
export type StepResult = {
  status: "ok" | "failed";
  exitCode: number;
  stdout: string;
  stderr: string;
  rateLimited?: true;
};
```
`rateLimited` is an optional field, absent from `execBashStep`'s return paths (bash steps are not subject to rate-limit detection).

**`src/engine/exec-claudecode.ts:1–14`** — claudecode exec module
Imports `isRateLimitError`; returns `{ ...r, status: "failed", rateLimited: true as const }` when rate-limited.

**`src/engine/exec-codex.ts:1–14`** — same pattern.

**`src/engine/exec-auggie.ts:1–17`** — same pattern.

**`src/engine/exec-gemini.ts`** — same pattern.

**`src/engine/exec-opencode.ts`** — same pattern.

**`src/engine/exec-pi.ts`** — same pattern.

All six AI exec modules (`claudecode`, `codex`, `auggie`, `gemini`, `opencode`, `pi`) apply `isRateLimitError` and set `rateLimited: true` on the returned `StepResult`. The `bash` exec module (`exec-bash.ts`) never sets `rateLimited`.

**`src/engine/run-cycle.ts:334–370`** — rate-limit retry loop (inside the step execution loop)

Key behavior:
- `r` sentinel initialized to `{ status: "failed", exitCode: -1, stdout: "", stderr: "" }` before `while (true)`.
- `wasRateLimited` boolean initialized to `false`.
- On each iteration: executes the step (bash or AI agent).
- Checks `r.rateLimited`: if true, reads `cfg.engine.rate_limit_backoff_ms ?? 3_600_000`, computes `retryAt = new Date(Date.now() + backoffMs).toISOString()`, emits `engine.paused { reason: "rate_limit", retry_at: retryAt }`, calls `sleepFn(backoffMs)`, sets `wasRateLimited = true`, continues the `while` loop (same step, same index).
- Breaks from `while (true)` only when `r.rateLimited` is falsy (either success or non-rate-limit failure).
- After the loop: if `wasRateLimited && r.status === "ok"`, emits `engine.resumed { reason: "rate_limit_cleared" }`.
- `append_system_prompt_ignored` warning is emitted **before** the `while(true)` loop begins (`run-cycle.ts:326–333`), so it fires exactly once per step regardless of how many rate-limit retries occur.
- `sleepFn` is injectable via `RunCycleOpts.sleepFn` (line 244) for test isolation.

**`src/defaults/workflows.yml:6`**
```yaml
rate_limit_backoff_ms: 3600000
```
Shipped default: 1 hour (3,600,000 ms). This is the value `cfg.engine.rate_limit_backoff_ms` resolves to when `loadConfig` reads the defaults.

**`RunCycleOpts` type** (`src/engine/run-cycle.ts:191–202`)
```typescript
export type RunCycleOpts = {
  …
  sleepFn?: (ms: number) => Promise<void>;
};
```

---

### Existing Patterns to Follow

- **Event field naming**: Other `engine.paused` events use `reason:` as the discriminant. The existing `engine.paused { reason: "all_triage_failed", raw_ids, last_errors }` in `docs/ARCHITECTURE.md:211` shows the established pattern.
- **`engine.resumed`** is not currently shown in the JSONL schema examples in the docs — it must be added alongside the corrected `engine.paused` rate-limit line.
- **No `rate_limit.hit` event**: This event name appears only in the stale docs. It is absent from the implementation. Do not reference it in the corrected docs.
- **Retry semantics**: Rate-limit retries are invisible to `run-one.ts` (the consecutive-failures counter). The loop is entirely internal to `runCycle`. This is documented in CLAUDE.md (authoritative) and must be stated in user-facing docs.
- **Config key**: `engine.rate_limit_backoff_ms` is the key name (snake_case, under `engine:` in `workflows.yml`). CLAUDE.md already uses this exact name.

---

### Dependencies & Integration Points

- **`loadConfig`** (`src/engine/workflow.ts`) — reads `engine.rate_limit_backoff_ms` from `workflows.yml` / merged env. Used at `run-cycle.ts:359`.
- **`run-one.ts`** — consecutive-failures counter; rate-limit retries are transparent to it because they complete inside `runCycle` before returning.
- **`CLAUDE.md`** — already accurately documents `engine.rate_limit_backoff_ms`, the retry loop, the events, and the no-consecutive-failures-increment behavior. It is **not** a target of this cycle (SPEC §Documentation Updates confirms this).

---

### Test Infrastructure

- **Framework**: Node.js built-in `node:test`.
- **Rate-limit unit tests**: `tests/engine/rate-limit.test.ts` — covers `isRateLimitError` pure helper.
- **Rate-limit integration tests**: `tests/engine/rate-limit-integration.test.ts` — 5 scenarios using stateful fake binaries (shell scripts with call counters): happy path (rate-limit once then success), consecutive rate-limit retries, non-rate-limit failure, and non-claudecode agent scenarios.
- **Test helpers**: `tests/helpers.ts` exports `expectExactlyOne(events, eventName)` for cardinality-pinning exactly-once events.
- **This cycle**: no new tests required — SPEC §Testing Strategy states `npm test` pass is the only verification needed.
- **Coverage**: rate-limit and run-cycle modules are already covered; no coverage floor changes needed.

---

## Code References

- `src/engine/rate-limit.ts:1–14` — `isRateLimitError` pure helper; RATE_LIMIT_PATTERNS constant
- `src/engine/exec-bash.ts:6–11` — `StepResult` type with `rateLimited?: true`
- `src/engine/exec-claudecode.ts:11` — rate-limit detection and `rateLimited: true` return
- `src/engine/exec-codex.ts:11` — same pattern
- `src/engine/exec-auggie.ts:14` — same pattern
- `src/engine/exec-gemini.ts:8` — same pattern
- `src/engine/exec-opencode.ts:13` — same pattern
- `src/engine/exec-pi.ts:16` — same pattern
- `src/engine/run-cycle.ts:244` — `sleepFn` default assignment (`setTimeout`-based)
- `src/engine/run-cycle.ts:334–335` — sentinel `r` initialization and `wasRateLimited` flag
- `src/engine/run-cycle.ts:336–367` — `while (true)` retry loop with `engine.paused` emission
- `src/engine/run-cycle.ts:368–370` — `engine.resumed` emission on first clean success
- `src/defaults/workflows.yml:6` — `rate_limit_backoff_ms: 3600000`
- `README.md:143` — stale rate-limit sentence (exit 42 claim)
- `BRIEF.md:185–187` — stale rate-limit bullet (exit 42 claim)
- `docs/ARCHITECTURE.md:182` — stale exit-code bullet (exit 42)
- `docs/ARCHITECTURE.md:210–216` — stale JSONL schema block (`rate_limit.hit`, `retry_after`, "not yet emitted" note)
- `docs/ARCHITECTURE.md:565–566` — stale failure-modes table (short/long split, exit 42)
- `tests/engine/rate-limit-integration.test.ts:1–end` — integration test suite (5 scenarios)
- `tests/engine/rate-limit.test.ts` — unit tests for `isRateLimitError`

---

## Open Questions

None. The implementation is fully shipped and readable. The exact event shapes, field names, config key, default value, and retry semantics are all directly observable from the source. The planner can proceed with concrete doc edits against the references above.
