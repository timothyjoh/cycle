# Implementation Plan: Cycle 0016

## Overview
Make the `cycle compress-output-hook` PreToolUse classifier surface its fail-open degrade paths with a one-line stderr diagnostic instead of swallowing them silently, while preserving the exit-0 / empty-stdout / never-block contract byte-for-byte.

## Current State (from Research)
- `runCompressOutputHook(stdinJson, ctx)` (`src/cli/compress-output-hook.ts:17-40`) is a pure function returning `HookResult = { stdout: string; exitCode: number }` (`src/cli/compress-output-hook.ts:3`). It has three degrade paths — non-string command early return (`:24`), non-rewritable command early return (`:25`), and the bare `catch` (`:36-39`) — each returning `{ stdout: "", exitCode: 0 }` with zero observable signal.
- The CLI argv branch (`src/cli.ts:96-106`) reads stdin, calls the hook, and writes only `result.stdout` before `process.exit(result.exitCode)` — it never writes stderr.
- Sibling CLI branches already establish the `{ stdout, stderr, exitCode }` shape and the "write stderr to `process.stderr`, then exit" convention: triage (`src/cli.ts:65-71`, `result.stderr + "\n"`), cleanup (`:80-86`), compress-output (`:88-94`).
- Existing tests (`tests/cli/compress-output-hook.test.ts:1-65`) assert `exitCode === 0` and `stdout === ""` (or rewrite stdout) for every path. They must stay green after `HookResult` gains an optional field.
- The pure classifier/builder core (`classifyCommand`, `buildRewriteCommand` in `src/engine/compress-filter.ts`) is out of scope.

## Desired End State
- `HookResult` carries an optional `stderr?: string` field.
- `runCompressOutputHook` populates `stderr` on the genuine degrade paths — the `catch` (mandatory) and the non-string-command early return (schema-drift signal) — with distinct, descriptive, `cycle compress-output-hook:`-prefixed messages. It does NOT set `stderr` on the rewrite-success path or the shell-operator / non-allowlisted passthrough.
- The CLI `compress-output-hook` branch writes `result.stderr` (when present) to `process.stderr` with a trailing newline, before `process.exit(result.exitCode)`.
- All existing tests pass; new tests pin the diagnostic policy. CLAUDE.md and docs/ENGINE.md are updated.
- Verify: `npm test`, `npm run typecheck`, `npm run test:coverage` (70% floor on `src/cli/compress-output-hook.ts` maintained) all clean.

## What We're NOT Doing
- No change to the rewrite/classification logic, the allowlist, `compress-filter.ts`, or `cycle compress-output`.
- No structured engine event (`step.warning`, `log.jsonl`) for hook failures — stderr text only.
- No change to any path's exit code or stdout contents — the fail-open contract is fixed.
- No blocking, retrying, or altering of tool-call behavior on hook error.
- No diagnostic on the shell-operator / non-allowlisted passthrough (normal traffic — would spam stderr).
- No README change (no user-facing surface change).

## Implementation Approach
Keep the function pure: it returns the diagnostic as data (`HookResult.stderr`), and the CLI shell performs the single `process.stderr.write`. This mirrors the documented pure-function + thin-CLI-shell split and the three sibling branches. Per-return policy:

| Path | Location | Emits diagnostic? | Rationale |
|---|---|---|---|
| `catch` (parse/throw) | `:36-39` | **Yes (mandatory)** | SPEC requires it; covers malformed JSON, empty stdin, any thrown error |
| non-string command | `:24` | **Yes** | This is exactly the schema-drift scenario the cycle targets (`tool_input.command` never located) — the highest-value visibility path |
| non-rewritable (operator / non-allowlisted) | `:25` | **No** | Normal passthrough; emitting would spam stderr on every ordinary command |
| rewrite success | `:26-35` | **No** | SPEC line 24 forbids it |

Messages share the `cycle compress-output-hook:` prefix with distinct reason substrings so tests can assert stable text:
- non-string: `cycle compress-output-hook: degraded (no rewrite) — PreToolUse event has no string tool_input.command (schema drift?); command passed through unchanged`
- catch: `cycle compress-output-hook: degraded (no rewrite) — could not parse PreToolUse event; command passed through unchanged`

The diagnostic string carries no trailing newline; the CLI appends `"\n"` (triage convention) on write.

## Failure & Resilience Decisions

**Task 1 — `runCompressOutputHook` change (pure function):** N/A — pure. No I/O, no subprocess, no filesystem. The function only constructs strings. Idempotent by construction (same input → same output). The diagnostic is the observability mechanism itself; no error is swallowed because the degrade path now returns a non-empty `stderr` signal instead of discarding context.

**Task 2 — CLI `compress-output-hook` branch stderr write:**
- **Failure modes**: the only new I/O is `process.stderr.write(result.stderr + "\n")`. A write to a closed/broken stderr pipe (EPIPE) is the realistic failure. Node's `process.stderr.write` returns a boolean and does not synchronously throw on a backpressured stream; an EPIPE surfaces as an async `error` event, not an exception at the call site. We do not add a handler — matching the three sibling branches, which write stderr unguarded. The fail-open contract is about not *blocking the tool call*; the exit code is computed from `result.exitCode` (always 0) and is unaffected by the stderr write outcome. Per SPEC: "The stderr write itself must not throw or change the exit code" — the unguarded `write` followed by `process.exit(result.exitCode)` satisfies this; the exit code is never derived from the write.
- **Idempotency**: the branch runs once per hook invocation and exits immediately; the engine may re-spawn the hook for a retried Bash tool call, but each invocation is independent and stateless (no file/state mutation), so re-runs are inherently safe.
- **Observability**: the diagnostic *is* the observability addition — it makes a previously-silent degrade visible on stderr. stdout (the hook protocol channel) is unchanged.
- **No silent failure**: the whole point — the degrade path that was silently swallowed now surfaces to `process.stderr`. No new catch is introduced.

---

## Task 1: Add optional `stderr` field to `HookResult` and populate it on degrade paths

### Overview
Extend the type and have the pure function return a diagnostic on the `catch` and non-string-command paths only.

### Changes Required
**File**: `src/cli/compress-output-hook.ts`

**Changes**:
- Widen the type:
  ```ts
  export type HookResult = { stdout: string; exitCode: number; stderr?: string };
  ```
- Non-string-command early return (`:24`):
  ```ts
  if (typeof command !== "string")
    return {
      stdout: "",
      exitCode: 0,
      stderr:
        "cycle compress-output-hook: degraded (no rewrite) — PreToolUse event has no string tool_input.command (schema drift?); command passed through unchanged",
    };
  ```
- Leave the non-rewritable return (`:25`) and the success path (`:26-35`) exactly as-is (no `stderr`).
- `catch` block (`:36-39`):
  ```ts
  } catch {
    // Fail open: never block a tool call on a hook/parse error — but surface it.
    return {
      stdout: "",
      exitCode: 0,
      stderr:
        "cycle compress-output-hook: degraded (no rewrite) — could not parse PreToolUse event; command passed through unchanged",
    };
  }
  ```
- Update the function doc comment to note: degrade paths now also return a one-line `stderr` diagnostic (the CLI writes it); exit code is still always 0 and stdout still empty on degrade.

### Success Criteria
- [ ] `npm run typecheck` clean (optional field, no breakage to `r.stdout`/`r.exitCode` consumers).
- [ ] `npm test` green (existing assertions unaffected — they don't read `stderr`).
- [ ] `catch` and non-string paths return non-empty `stderr`; rewrite and non-rewritable paths leave `stderr` undefined.
- [ ] Failure paths behave as designed: degrade still `{ stdout: "", exitCode: 0 }`, now plus `stderr`; no error swallowed.

---

## Task 2: Plumb the diagnostic to `process.stderr` in the CLI hook branch

### Overview
The `compress-output-hook` argv branch writes `result.stderr` to stderr before exiting, matching the triage branch's shape.

### Changes Required
**File**: `src/cli.ts` (branch at `:96-106`)

**Changes**: insert the stderr write between the stdout write and the exit:
```ts
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr + "\n");
  process.exit(result.exitCode);
```

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] stdout (hook protocol) unchanged; stderr written only when `result.stderr` is present.
- [ ] `process.exit(result.exitCode)` still the final call; exit code unchanged by the write.
- [ ] Failure paths behave as designed: write is unguarded like sibling branches; exit code never derived from write outcome.

---

## Task 3: Tests pinning the diagnostic policy

### Overview
Extend `tests/cli/compress-output-hook.test.ts` to assert the diagnostic field's presence on degrade paths and absence on success/passthrough, keeping all existing assertions green.

### Changes Required
**File**: `tests/cli/compress-output-hook.test.ts`

**Changes** (add to the existing suite; do not weaken existing assertions):
- Extend the malformed-JSON test (`:45-49`) to additionally assert:
  ```ts
  assert.ok(r.stderr && r.stderr.length > 0);
  assert.match(r.stderr, /^cycle compress-output-hook:/);
  assert.match(r.stderr, /could not parse/);
  ```
- Extend the rewrite-success test (`:7-15`) to assert NO diagnostic:
  ```ts
  assert.equal(r.stderr, undefined);
  ```
- Extend the non-string-command test (`:38-43`) to assert a distinct diagnostic:
  ```ts
  assert.ok(r.stderr && r.stderr.length > 0);
  assert.match(r.stderr, /no string tool_input\.command/);
  ```
- Extend the shell-operator passthrough test (`:17-22`) and the non-allowlisted passthrough test (`:24-29`) to assert NO diagnostic (pins the "must not spam" policy):
  ```ts
  assert.equal(r.stderr, undefined);
  ```
- Add an empty-stdin diagnostic assertion (`:51-55`): empty stdin hits the `catch` (JSON.parse throws), so `r.stderr` is the catch message:
  ```ts
  assert.match(r.stderr ?? "", /could not parse/);
  ```
- The `missing tool_input.command` test (`:31-36`, `tool_input: {}`) hits the non-string path → assert the schema-drift diagnostic substring there too.

### Success Criteria
- [ ] All existing assertions remain green.
- [ ] New assertions pin: distinct messages for catch vs non-string; absent diagnostic on success and on both passthrough returns.
- [ ] `npm run test:coverage` keeps `src/cli/compress-output-hook.ts` ≥ 70% and does not lower global floors (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%).

---

## Task 4: Documentation updates

### Overview
Update CLAUDE.md and docs/ENGINE.md to reflect the new stderr diagnostic; no command-table or README change.

### Changes Required
**File**: `CLAUDE.md` (Workflow defaults → `engine.compress_output` bullet, "Fail-open" sentence)
**Changes**: Amend the Fail-open note to state that hook degrade paths (parse/schema-drift) now write a one-line `cycle compress-output-hook:`-prefixed diagnostic to stderr, while still exiting 0 with empty stdout and never blocking the tool call.

**File**: `docs/ENGINE.md` (PreToolUse compression hook section, ~`:207-214`)
**Changes**: Replace the "Known limitation: degrade paths emit no diagnostic" note (~`:211`) with a statement that degrade paths now surface a one-line stderr diagnostic alongside the existing fail-open behavior (exit 0, empty stdout, never block).

### Success Criteria
- [ ] CLAUDE.md Fail-open note mentions the stderr diagnostic.
- [ ] docs/ENGINE.md no longer claims degrade paths are silent.
- [ ] No command-table row added; README untouched.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] `runCompressOutputHook("{not json", CTX)` returns `exitCode === 0`, `stdout === ""`, and a non-empty diagnostic string (asserted via the returned `HookResult` field). | Task 1, Task 3 | catch path populates `stderr`; test asserts it |
| [ ] The allowlisted-success path (`"git status"`) returns the rewrite stdout, `exitCode === 0`, and NO diagnostic (the diagnostic field is empty/undefined). | Task 1, Task 3 | success path leaves `stderr` undefined; test asserts `r.stderr === undefined` |
| [ ] At least one early-return degrade path covered by a test asserts the documented behavior: exit 0, empty stdout, and either an emitted diagnostic or an explicitly-asserted absent diagnostic, matching the implemented policy. | Task 1, Task 3 | non-string → emitted diagnostic; operator/non-allowlisted → asserted-absent |
| [ ] `src/cli.ts`'s `compress-output-hook` branch writes the diagnostic to `process.stderr` when present and still calls `process.exit(result.exitCode)`. | Task 2 | `if (result.stderr) process.stderr.write(result.stderr + "\n")` before exit |
| [ ] **Failure-path:** for malformed JSON input, the hook produces a non-empty stderr diagnostic while exiting 0 with empty stdout — verified by a passing test. | Task 1, Task 3 | malformed-JSON test extended with diagnostic assertion |
| [ ] All existing tests still pass (`npm test`). | Task 3 | optional field; existing assertions untouched and re-run |
| [ ] No compiler/linter warnings introduced (`npm run typecheck`). | Task 1, Task 2 | optional `stderr?: string`; `tsc --noEmit` clean |

## Testing Strategy

### Unit Tests
- **Catch path (malformed JSON, empty stdin)**: exit 0, `stdout === ""`, `stderr` non-empty and matching `/^cycle compress-output-hook:/` + `/could not parse/`.
- **Non-string command (`command: 42`, missing `command`)**: exit 0, empty stdout, `stderr` matching `/no string tool_input\.command/` — distinct from the catch message.
- **Rewrite success (`"git status"`)**: rewrite stdout present, `stderr === undefined`.
- **Passthrough (shell operator `"git log | head"`, non-allowlisted `"rm -rf /"`)**: exit 0, empty stdout, `stderr === undefined` — pins the no-spam policy.
- **Loop over `null`/`true`/`[]`/string/number** (`:57-65`): existing exit-0/empty-stdout assertions stay; these hit the non-string return, so `stderr` may be set — assertions there remain limited to exitCode/stdout to avoid over-pinning.
- **Failure-path coverage**: every named failure mode (malformed JSON, schema drift / missing command) has a scenario asserting `{ exitCode: 0, stdout: "", stderr: <non-empty> }`.
- **Mocking strategy**: none — drive `runCompressOutputHook` directly with real stdin strings and the existing module-level `CTX` fixture. No `node:fs`/`child_process` mocking (real implementations only).

### Integration / E2E Tests
- None required — no UI surface, no engine-wiring change. The CLI stderr write (Task 2) is a one-line plumb mirroring three tested sibling branches; the pure function carries the behavior and is unit-tested directly. (If desired, a lightweight spawn of `node dist/cycle.js compress-output-hook` piping `{not json` and asserting non-empty stderr + exit 0 could be added, but it is not necessary for acceptance and is omitted to avoid a build-dependent test.)

## Risk Assessment
- **Existing tests reading only `stdout`/`exitCode` could over-constrain via strict object equality**: the suite uses field-wise `assert.equal(r.stdout, …)` / `assert.equal(r.exitCode, 0)`, not `deepEqual` on the whole object, so the added optional `stderr` does not break them. Verified against `tests/cli/compress-output-hook.test.ts:7-65`.
- **stderr spam on normal traffic**: mitigated by emitting only on `catch` and non-string paths; the high-frequency non-rewritable passthrough stays silent, asserted by Task 3 tests.
- **Coverage floor regression**: the new branches are all exercised by Task 3 tests; run `npm run test:coverage` to confirm `src/cli/compress-output-hook.ts` stays ≥ 70% and globals hold.
- **EPIPE on stderr write**: unguarded write matches sibling branches and does not throw synchronously; exit code is independent of the write, preserving the fail-open contract.
