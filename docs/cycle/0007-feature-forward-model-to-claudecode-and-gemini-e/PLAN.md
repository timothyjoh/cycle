# Implementation Plan: Cycle 0007

## Overview
Make the `claudecode` and `gemini` exec modules forward `--model <model>` to their CLI subprocesses when a non-empty `model` is set, closing the gap where per-step `model:` (and `defaults.model` resolution from cycle 0006) is silently discarded by the two most-used agents.

## Current State (from Research)
- `claudecodeExec` (`src/engine/exec-claudecode.ts:5-19`) destructures `{ appendSystemPrompt, ...args }` — never reads `model`/`thinking`. It builds `argv = ["--permission-mode", "auto"]`, optionally pushes `--append-system-prompt <value>`, pushes `-p` last, then calls `runAgent({ binary: "claude", argv, promptDelivery: "argv", ...args })`. `runAgent` argv-mode appends the prompt body after `-p`, so `-p` must remain the last builder-set element.
- `geminiExec` (`src/engine/exec-gemini.ts:5-11`) calls `runStep(args)` with `argv: []`, `promptDelivery: "stdin"`. It never destructures `model`/`thinking`; it spreads the full `args` object into `runAgent`, which ignores unknown props.
- The forwarding precedent is `auggieExec` (`src/engine/exec-auggie.ts:9-15`): destructure `{ model, thinking, ...args }`, `if (model) argv.push("--model", model)`, and `thinking` is intentionally unused. `codexExec` (`src/engine/exec-codex.ts:6-13`) is the same pattern plus `--thinking` (not wanted here).
- The `ExecModule.runStep` signature (`src/engine/exec.ts:9-29`) already declares optional `model?`/`thinking?`; `run-cycle.ts:340-348` already passes `model: step.model`/`thinking: step.thinking`. No wiring change needed.
- `runAgent` (`src/engine/exec-spawn.ts`) accepts `{ binary, argv, promptDelivery, promptPath, repoRoot, env?, signal? }` — it does NOT accept `model`/`thinking`, so both modules must destructure those off before spreading `...args`.
- Tests are per-module `node:test` files (`tests/engine/exec-claudecode.test.ts`, `tests/engine/exec-gemini.test.ts`) using fake `echo "$@"` binaries on a temp `PATH`; argv is asserted via `r.stdout` matching/splitting. Neither file currently has a `--model` test. `exec-codex.test.ts:61-146` is the presence/ordering template; `exec-claudecode.test.ts:49-104` is the append-system-prompt/`-p`-ordering template.

## Desired End State
- `exec-claudecode.ts` destructures `{ appendSystemPrompt, model, thinking, ...args }`; when `model` is truthy it pushes `--model <model>` before `-p` (and `thinking` is ignored). `-p` stays the final builder element in all permutations.
- `exec-gemini.ts` destructures `{ model, thinking, ...args }`; when `model` is truthy it pushes `--model <model>` onto its argv; `thinking` is ignored; `promptDelivery: "stdin"` unchanged.
- New tests assert: `--model` present when set / absent when unset / absent on empty-string for both modules; claudecode `-p`-last across the four permutations of `{model present/absent} × {appendSystemPrompt present/absent}`; neither module emits `--thinking` when `thinking` is passed.
- CLAUDE.md, AGENTS.md (if present), `docs/ENGINE.md`, and `src/engine/exec.ts` doc comments reflect that `claudecode`/`gemini` now map `model` → `--model` and ignore `thinking`.
- Verify: `npm run typecheck` clean, `npm test` green, `npm run test:coverage` meets floors.

## What We're NOT Doing
- No `--thinking` forwarding for either module (neither CLI exposes it).
- No changes to `codex`, `auggie`, `opencode`, or `pi` exec modules (already forward `--model`).
- No changes to `run-cycle.ts`, `exec.ts` dispatch/REGISTRY, or `loadConfig` `defaults.{agent,model,thinking}` resolution (landed in cycle 0006).
- No new structural invariant for agent-fleet/model-flag consistency.
- No README changes beyond the agent-notes already covered by CLAUDE.md.
- No change to `runAgent`/`exec-spawn.ts` signature or rate-limit detection logic.

## Implementation Approach
Apply the established `auggie` forwarding idiom to both modules: destructure `model`/`thinking` off the runStep args, guard `--model` push on `model` truthiness (which naturally treats `undefined` and `""` as "not set"), and leave `thinking` unused. For claudecode, insert `--model` immediately after the `--permission-mode auto` pair and the optional `--append-system-prompt` push, but before `argv.push("-p")`, so `-p` remains last. Decision pinned: `--model` is pushed **after** `--append-system-prompt` (both before `-p`). Both modules continue to spread `...args` (now without `model`/`thinking`) into `runAgent`, preserving prompt-delivery mode and rate-limit wrapping verbatim. Tests mirror existing exec-test seams (fake binaries, argv-from-stdout assertions); no production seam or mocking added.

## Failure & Resilience Decisions

**Task 1 / Task 2 (argv-builder edits in exec-claudecode.ts and exec-gemini.ts):**
- **Failure modes**: The only new branch is `if (model) argv.push(...)`, a pure in-memory array operation that cannot fail. A falsy `model` (`undefined`/`""`) skips the push and the module runs normally with no `--model` flag — no empty/invalid flag is emitted. If the CLI later rejects a supplied model value, that surfaces as a non-zero exit captured by `runAgent` into the returned `StepResult` (`status: "failed"` + head-capped stderr); these modules add no new catch/swallow point.
- **Idempotency**: argv construction is deterministic and side-effect-free; re-running `runStep` with identical args produces identical argv. The engine's step retry/restart re-invokes `runStep` fresh each time — safe. The subprocess spawn itself is owned by `runAgent` (unchanged) and inherits its existing re-run behavior; no new persistent state is written by these modules.
- **Observability**: Unchanged — these modules emit no logs/events; `run-cycle.ts` emits `step.end` (with head-capped stderr on failure), `engine.paused`/`engine.resumed` for rate limits. Rate-limit detection (`isRateLimitError(r)` → `{ ...r, status: "failed", rateLimited: true }`) is preserved verbatim, so the engine's rate-limit retry orchestration continues to fire.
- **No silent failure**: No new `try`/`catch`. Errors continue to surface via `runAgent`'s non-zero-exit `StepResult` to `run-cycle.ts`. `thinking` being ignored is intentional (no throw, matching auggie) and documented, not a swallowed error.

**Task 3 (documentation):** N/A — pure docs.

---

## Task 1: Forward `--model` in `exec-claudecode.ts`

### Overview
Destructure `model`/`thinking` off the runStep args and push `--model <model>` before the trailing `-p` when `model` is truthy; `thinking` stays unused.

### Changes Required
**File**: `src/engine/exec-claudecode.ts`
**Changes**: Update the destructure and insert the guarded `--model` push.

```ts
export const claudecodeExec: ExecModule = {
  async runStep({ appendSystemPrompt, model, thinking, ...args }) {
    // ...existing --permission-mode comment...
    const argv: string[] = ["--permission-mode", "auto"];
    if (appendSystemPrompt) argv.push("--append-system-prompt", appendSystemPrompt);
    if (model) argv.push("--model", model);
    // claude CLI has no thinking flag; `thinking` is intentionally unused.
    argv.push("-p");
    const r = await runAgent({ binary: "claude", argv, promptDelivery: "argv", ...args });
    if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true as const };
    return r;
  },
};
```

`thinking` is destructured (to strip it from `...args` so it never leaks to `runAgent`) and intentionally unused; add the one-line comment to document intent and satisfy no-unused-via-rest.

### Success Criteria
- [ ] `npm run typecheck` clean (no unused-var error; `thinking` consumed via rest-strip + comment).
- [ ] `npm run build` succeeds.
- [ ] argv contains adjacent `["--model", value]` when `model` set; no `--model` token when unset/empty.
- [ ] `-p` is the last builder-set argv element in all permutations.
- [ ] No `--thinking` ever emitted.
- [ ] Failure paths unchanged: rate-limit wrapping and `argv` prompt delivery preserved; no new catch.

---

## Task 2: Forward `--model` in `exec-gemini.ts`

### Overview
Switch `geminiExec.runStep` from bare `runStep(args)` to the destructure-then-spread idiom so it consumes `model`/`thinking` and appends `--model <model>` to its argv when `model` is truthy; `stdin` delivery and `thinking`-ignored behavior preserved.

### Changes Required
**File**: `src/engine/exec-gemini.ts`
**Changes**:

```ts
export const geminiExec: ExecModule = {
  async runStep({ model, thinking, ...args }) {
    const argv: string[] = [];
    if (model) argv.push("--model", model);
    // gemini CLI has no thinking flag here; `thinking` is intentionally unused.
    const r = await runAgent({ binary: "gemini", argv, promptDelivery: "stdin", ...args });
    if (isRateLimitError(r)) return { ...r, status: "failed", rateLimited: true as const };
    return r;
  },
};
```

Destructuring `model`/`thinking` off also stops them leaking into `runAgent` via the prior `...args` spread.

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] `npm run build` succeeds.
- [ ] argv contains adjacent `["--model", value]` when `model` set; no `--model` token when unset/empty.
- [ ] No `--thinking` ever emitted.
- [ ] `promptDelivery: "stdin"` and rate-limit wrapping preserved unchanged.

---

## Task 3: Update documentation

### Overview
Correct per-agent model-flag notes that imply claudecode/gemini drop `model`.

### Changes Required
**File**: `CLAUDE.md` — Architecture "Registered step agents" note.
**Changes**: Update the `claudecode` and `gemini` entries to state that `model` maps to `--model` and `thinking` is unsupported/ignored (matching the auggie phrasing). Currently the note lists `model`/`thinking` mapping only for `codex`, `auggie`, `opencode`, `pi`; claudecode/gemini are bare. Add: `claudecode` (`model` → `--model`; `thinking` ignored — claude CLI has no thinking flag; prompt via argv `-p`), `gemini` (`model` → `--model`; `thinking` ignored; prompt via stdin).

**File**: `docs/ENGINE.md` (line ~11)
**Changes**: Replace the statement that only "`codex`, `auggie`, `opencode`, and `pi` agents accept optional `model` and `thinking`" so it includes `claudecode`/`gemini` accepting `model` (mapped to `--model`) while ignoring `thinking`.

**File**: `src/engine/exec.ts` doc comments
**Changes**: If any per-agent comment in `exec.ts` (e.g. around the `REGISTRY`/`ExecModule` declaration) claims or implies claudecode/gemini drop `model`, correct it to reflect `--model` forwarding. If no such comment exists, no change.

**File**: `AGENTS.md`
**Changes**: If this file exists and mirrors the CLAUDE.md agent note, apply the same correction; if absent, skip (no creation).

### Success Criteria
- [ ] CLAUDE.md `claudecode`/`gemini` entries state `model` → `--model` and `thinking` ignored.
- [ ] `docs/ENGINE.md` no longer omits claudecode/gemini from `--model` support.
- [ ] `exec.ts` comments contain no stale "drops model" claim for these agents.
- [ ] No code without matching docs (docs are part of "done").

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] exec-claudecode argv contains --model <value> when model is set, and contains no --model token when model is unset.` | Task 1 (impl), Task 4 (tests) | |
| `[ ] exec-claudecode argv ends with -p in all cases (model set and unset, append-system-prompt present and absent).` | Task 1 (impl), Task 4 (tests) | Four-permutation `-p`-last coverage incl. combined case |
| `[ ] exec-gemini argv contains --model <value> when model is set, and contains no --model token when model is unset.` | Task 2 (impl), Task 4 (tests) | |
| `[ ] Neither exec-claudecode nor exec-gemini ever emits --thinking, even when a thinking value is passed.` | Tasks 1, 2 (impl), Task 4 (tests) | |
| `[ ] Failure-path: passing model: "" (empty string) to either module produces argv with no --model flag (treated as unset, no empty-value flag emitted) — asserted by test.` | Tasks 1, 2 (impl), Task 4 (tests) | Truthiness guard handles `""` |
| `[ ] All existing tests still pass.` | Task 4 (full `npm test`) | |
| `[ ] No compiler/linter warnings introduced (npm run typecheck clean).` | Tasks 1, 2 (typecheck) | |

---

## Testing Strategy

### Unit Tests
Add to `tests/engine/exec-claudecode.test.ts` and `tests/engine/exec-gemini.test.ts`, mirroring the fake-binary `echo "$@"` seam and `r.stdout` argv-assertion style already used (`exec-codex.test.ts:61-146`, `exec-claudecode.test.ts:49-104`).

**exec-claudecode.test.ts** (new cases):
- **Happy path**: `model: "claude-opus-4-8"` → `r.stdout` matches `/--model/` and the model value, with `--model` immediately followed by the value (split-and-index adjacency).
- **Default path**: `model` omitted → `assert.ok(!r.stdout.includes("--model"))`.
- **Failure/edge path**: `model: ""` → `assert.ok(!r.stdout.includes("--model"))` (no empty-value flag).
- **Ordering — `-p` last, four permutations**: split `r.stdout.trim().split(/\s+/)`, assert the last builder token before the appended prompt is `-p` for: (a) no model, no appendSP; (b) model only; (c) appendSP only; (d) model + appendSP both present. Use index comparison (`indexOf("--model") < indexOf("-p")`, `indexOf("--append-system-prompt") < indexOf("-p")`).
- **Thinking ignored**: pass `thinking: "high"` → `assert.ok(!r.stdout.includes("--thinking"))`.

**exec-gemini.test.ts** (new cases):
- **Happy path**: `model` set → argv includes adjacent `["--model", value]`. (Note: gemini uses `stdin` delivery, so the fake binary must echo `"$@"` to capture argv; the prompt arrives on stdin, not argv — assert argv contains `--model` and value only.)
- **Default path**: `model` omitted → no `--model`.
- **Failure/edge path**: `model: ""` → no `--model`.
- **Thinking ignored**: `thinking: "high"` passed → no `--thinking`.

**Mocking strategy**: No `mock.method`. Use real fake-binary shell scripts on a temp `PATH` (the existing convention in both files). Prefer real `runAgent` execution over stubbing.

**Failure-path tests mapping**: the `model: ""` cases exercise the falsy-`model` "treated as unset" branch; existing ENOENT / non-zero-exit / rate-limit tests in both files already exercise the spawn-failure and rate-limit surfaces and must keep passing unchanged (confirming the failure-surfacing path is intact after the argv edit).

### Integration / E2E Tests
None required (SPEC: "No UI changes; no E2E tests required"). The `run-cycle.ts → mod.runStep({ model })` plumbing is already covered by cycle 0006 and is out of scope.

## Risk Assessment
- **gemini argv vs stdin prompt confusion in tests**: gemini delivers the prompt via stdin, so the fake binary's `echo "$@"` captures only argv — assert `--model` presence there, not in the prompt body. Mitigation: model the gemini test on the existing gemini happy-path test (which already handles stdin delivery) rather than the claudecode argv-prompt test.
- **Unused `thinking` triggering a typecheck/lint error**: destructuring `thinking` without using it could warn. Mitigation: it is stripped via the rest pattern (so it can't leak to `runAgent`) and documented with an "intentionally unused" comment, exactly as `auggie` does today — confirmed compiling there.
- **Coverage floor regression**: new branches (`if (model)`) add coverage obligations. Mitigation: the set/unset/empty tests exercise both branch arms for each module, keeping branch coverage at/above floor.
