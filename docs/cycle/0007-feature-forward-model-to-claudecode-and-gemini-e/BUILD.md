Both changed source files report 100% line/branch/function coverage; the coverage gate passed all per-file floors (exit 0). All quality gates are green. Writing the build summary.

## Summary

This cycle made the `claudecode` and `gemini` exec modules forward `--model <model>` to their CLI subprocesses, closing the gap where per-step `model:` (and the `defaults.model` resolution landed in cycle 0006) was silently discarded by the two most-used agents.

**Files modified:**
- `src/engine/exec-claudecode.ts` (+3 net lines): destructured `{ appendSystemPrompt, model, thinking, ...args }`; added `if (model) argv.push("--model", model)` positioned after the optional `--append-system-prompt` push and before the trailing `argv.push("-p")`, so `-p` remains the final builder token; `thinking` is destructured only to strip it from `...args` and is intentionally unused (claude CLI has no thinking flag), matching the auggie precedent.
- `src/engine/exec-gemini.ts` (+4 net lines): switched from bare `runStep(args)` to the destructure-then-spread idiom `{ model, thinking, ...args }`; built an `argv` array, pushed `["--model", model]` when `model` is truthy, and passed it to `runAgent` with `promptDelivery: "stdin"` preserved; `thinking` stripped and ignored.
- `tests/engine/exec-claudecode.test.ts` (+~150 lines): added five tests — `--model` present-and-adjacent-to-value when set; absent when omitted; absent on empty-string `model: ""`; `-p`-last across all four `{model present/absent} × {appendSystemPrompt present/absent}` permutations (asserting only the prompt body follows `-p`); and no `--thinking` emitted when `thinking: "high"` is passed.
- `tests/engine/exec-gemini.test.ts` (+~115 lines): added four tests — `--model` present-and-adjacent-to-value when set; absent when omitted; absent on empty-string `model: ""`; and no `--thinking` emitted when `thinking` is passed. Gemini's fake binary echoes `$@` (argv) since the prompt arrives on stdin.
- `CLAUDE.md`: updated the "Registered step agents" note so the `claudecode` and `gemini` entries state `model` maps to `--model` (claudecode: inserted before the trailing `-p`, prompt via argv `-p`; gemini: prompt via stdin) and that `thinking` is silently ignored for both.
- `docs/ENGINE.md`: corrected the agent-dispatch paragraph (line 11) that previously listed only `codex`/`auggie`/`opencode`/`pi` as accepting `model`/`thinking`; it now states `claudecode`/`gemini`/`auggie` map `model` → `--model` while ignoring `thinking`, and notes a falsy `model` emits no flag.

**PLAN.md tasks complete:** Task 1 (forward `--model` in exec-claudecode.ts), Task 2 (forward `--model` in exec-gemini.ts), Task 3 (documentation — CLAUDE.md and docs/ENGINE.md; `src/engine/exec.ts` doc comment was left unchanged because it concerns only `appendSystemPrompt` and makes no stale "drops model" claim, and no `AGENTS.md` exists in the repo), and Task 4 (unit tests for both modules).

**Test suite:** `npm test` → **782 passed, 0 failed** (exit 0). `npm run typecheck` (`tsc --noEmit`) is clean.

**Coverage:** `npm run test:coverage` → exit 0; the LCOV-driven coverage gate passed every per-file floor (e.g. triage.ts 99.75%, run-cycle.ts 100%, rate-limit.ts 100%) and the structural-invariants check passed. The two changed source files report **`exec-claudecode.ts` 100.00% line / 100.00% branch / 100.00% function** and **`exec-gemini.ts` 100.00% / 100.00% / 100.00%** — the new `if (model)` branch arms are covered by the set/unset/empty tests in both files. No per-file regression.

**Failure modes handled:** (1) Validation/edge — a falsy `model` (`undefined` or `""`) is treated as "not set": the truthiness guard `if (model)` skips the push so no empty/invalid `--model` flag is emitted; covered by the `model: ""` and model-omitted tests for both modules. (2) Ignored input — any `thinking` value is silently dropped (destructured off `...args`, no flag, no throw), matching the auggie precedent; covered by the "never emits `--thinking`" tests. (3) Idempotency — argv construction is deterministic and side-effect-free, so step retry/restart re-invokes `runStep` with identical args and produces identical argv. (4) No new swallow point — no `try`/`catch` added; non-zero CLI exits (including a CLI rejecting a bad model value) continue to surface through `runAgent`'s `StepResult` (`status: "failed"` + head-capped stderr), and rate-limit detection (`isRateLimitError(r)` → `{ ...r, status: "failed", rateLimited: true }`) plus prompt-delivery mode (`argv` for claudecode, `stdin` for gemini) are preserved verbatim; the existing ENOENT, non-zero-exit, and rate-limit tests in both files still pass, confirming the failure-surfacing path is intact.

**Deviations from PLAN.md:** None of substance. The planned `--model` ordering for claudecode (after `--append-system-prompt`, before `-p`) was implemented as pinned. One mechanical addition not in the plan's code sketch: the claudecode `-p`-ordering test required an explicit element type annotation on the `permutations` array (`Array<{ … model?; appendSystemPrompt? }>`) because TypeScript otherwise narrowed the heterogeneous array literal to a union lacking the optional properties — a test-only typing fix, no production impact.

**Deferred / follow-up:** None. The SPEC's out-of-scope items (no `--thinking` forwarding, no changes to codex/auggie/opencode/pi, no structural invariant for agent-fleet/model-flag consistency, no `run-cycle.ts`/`exec.ts`/`loadConfig` changes) were respected.

## Touched Files
- src/engine/exec-claudecode.ts
- src/engine/exec-gemini.ts
- tests/engine/exec-claudecode.test.ts
- tests/engine/exec-gemini.test.ts
- CLAUDE.md
- docs/ENGINE.md
- docs/ARCHITECTURE.md
