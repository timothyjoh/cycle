# Review: Cycle 0007

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A tight, well-scoped change that applies the established `auggie`/`codex` `--model` forwarding idiom to `claudecodeExec` and `geminiExec`. The implementation exactly matches SPEC and PLAN, preserves prompt-delivery mode and rate-limit wrapping verbatim, and is fully covered by tests (100% line/branch/function on both changed source files). Documentation was updated in lockstep.

### Findings
1. **Correctness**: `claudecodeExec` pushes `--model` after the optional `--append-system-prompt` and before `argv.push("-p")`, keeping `-p` the final builder token — `src/engine/exec-claudecode.ts:14`.
2. **Correctness**: `geminiExec` builds an explicit `argv` array and pushes `--model` only when `model` is truthy, with `promptDelivery: "stdin"` unchanged — `src/engine/exec-gemini.ts:7-11`.
3. **Failure handling (fail-safe)**: The only new logic is `if (model) argv.push(...)`, a pure in-memory operation. Falsy `model` (`undefined`/`""`) is treated as unset — no empty/invalid flag emitted. No new `try`/`catch`, no swallow point; CLI rejection of a bad model value still surfaces via `runAgent`'s non-zero-exit `StepResult`. No fail-open path introduced.
4. **Observability**: Unchanged and correct — rate-limit detection (`isRateLimitError(r)` → `{ ...r, status: "failed", rateLimited: true }`) preserved in both modules (`src/engine/exec-claudecode.ts:17`, `src/engine/exec-gemini.ts:12`).
5. **Idempotency**: argv construction is deterministic and side-effect-free; step retry/restart re-invokes `runStep` with identical args producing identical argv. No persistent state written.
6. **Unused-var discipline**: `thinking` is destructured solely to strip it from `...args` so it never leaks to `runAgent`, and is documented as intentionally unused with an inline comment — matching the auggie precedent and compiling clean.
7. **Architecture fit**: No change to `ExecModule` signature, `REGISTRY`, `run-cycle.ts` plumbing, or `loadConfig` resolution — all correctly out of scope (landed cycle 0006). `src/engine/exec.ts` doc comment was correctly left unchanged (it concerns only `appendSystemPrompt` and makes no stale "drops model" claim).

### Spec Compliance Checklist
- [x] `exec-claudecode` argv contains adjacent `--model <value>` when set, omits `--model` when unset — `src/engine/exec-claudecode.ts:14`
- [x] `exec-claudecode` argv ends with `-p` across all model/appendSystemPrompt permutations — `src/engine/exec-claudecode.ts:15`
- [x] `exec-gemini` argv contains adjacent `--model <value>` when set, omits when unset — `src/engine/exec-gemini.ts:8`
- [x] Neither module emits `--thinking` — `thinking` destructured and unused in both
- [x] Falsy `model` (`""`) treated as unset — truthiness guard in both modules
- [x] Rate-limit handling and `promptDelivery` mode preserved unchanged
- [x] `npm run typecheck` clean (verified)
- [x] All existing tests pass (782 passed, 0 failed — verified)
- [x] CLAUDE.md `claudecode`/`gemini` entries updated — `CLAUDE.md:63`
- [x] `docs/ENGINE.md` agent-dispatch paragraph corrected — `docs/ENGINE.md:11`
- [x] SPEC.md contains a non-empty `## Acceptance Criteria` section (7 testable bullets)
- [x] PLAN.md contains a `## SPEC Acceptance Traceability` section re-quoting every SPEC AC bullet verbatim, each paired with a covering task id

## Adversarial Test Review

### Summary
Strong. Tests use real fake-binary shell scripts on a temp `PATH` (no `mock.method`, no over-mocking) and assert on captured argv via `r.stdout`. They cover happy path, default path, the empty-string edge case, ordering across all four permutations, the thinking-ignored case, and preserve the pre-existing ENOENT / non-zero-exit / rate-limit failure tests.

### Findings
1. **Assertion quality (strong)**: Adjacency is asserted by index (`argv[i + 1] === value`), not mere substring presence — `tests/engine/exec-claudecode.test.ts:128`, `tests/engine/exec-gemini.test.ts:104`.
2. **Boundary coverage (strong)**: Empty-string `model: ""` explicitly asserted to emit no flag for both modules — `tests/engine/exec-claudecode.test.ts:160`, `tests/engine/exec-gemini.test.ts:136`.
3. **Ordering rigor (strong)**: The `-p`-last test iterates all four `{model} × {appendSystemPrompt}` permutations and pins `argv.length === pIdx + 2` so nothing but the prompt body follows `-p` — `tests/engine/exec-claudecode.test.ts:186-223`.
4. **Failure-path retained**: Pre-existing ENOENT (`exitCode: -1`), non-zero-exit, and rate-limit (`rateLimited: true`) tests still present and passing in both files — confirms the argv edit did not regress the failure-surfacing path.
5. **Test independence (good)**: Each test creates and tears down its own temp `root`/`bin` in `try/finally`; no shared state or ordering dependence.

### Test Coverage
- Command run: `npm run test:coverage`
- `src/engine/exec-claudecode.ts`: 100.00% line / 100.00% branch / 100.00% function
- `src/engine/exec-gemini.ts`: 100.00% line / 100.00% branch / 100.00% function
- Regressions vs base (per-file): none — every per-file floor passed (e.g. run-cycle.ts 100%, triage.ts 99.75%, rate-limit.ts 100%); structural-invariants check passed
- New code without tests: none
- Specific scenarios missing tests: none — every SPEC acceptance bullet has at least one covering test

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| claudecode "`model` maps to `--model` — inserted before the trailing `-p`" | `CLAUDE.md:63` | `src/engine/exec-claudecode.ts:14` (push before `:15` `-p`) | OK |
| claudecode "`thinking` is silently ignored — the claude CLI has no thinking flag" | `CLAUDE.md:63` | `src/engine/exec-claudecode.ts:6` (destructured, unused) | OK |
| gemini "`model` maps to `--model` … prompt delivered via stdin" | `CLAUDE.md:63` | `src/engine/exec-gemini.ts:8,11` (`promptDelivery: "stdin"`) | OK |
| gemini "`thinking` is silently ignored" | `CLAUDE.md:63` | `src/engine/exec-gemini.ts:6` (destructured, unused) | OK |
| "`claudecode`, `gemini`, and `auggie` agents map `model` → `--model <value>` but ignore `thinking`" | `docs/ENGINE.md:11` | `src/engine/exec-claudecode.ts:14`, `src/engine/exec-gemini.ts:8` | OK |
| "for `claudecode` the `--model` pair is inserted before the trailing `-p`" | `docs/ENGINE.md:11` | `src/engine/exec-claudecode.ts:14-15` | OK |
| "for `gemini` it is appended to the otherwise-empty argv (prompt delivered via stdin)" | `docs/ENGINE.md:11` | `src/engine/exec-gemini.ts:7-11` | OK |
| "A falsy `model` (undefined/empty) emits no `--model` flag" | `docs/ENGINE.md:11` | `src/engine/exec-claudecode.ts:14`, `src/engine/exec-gemini.ts:8` (`if (model)` guard) | OK |

All in-scope documentation prose changes are backed by a concrete `file:line` reference at HEAD. No unbacked claims.
