# Research: Cycle 0065

## Cycle Context
Failed bash `step.end` events currently drop captured stderr on the floor — `src/engine/run-cycle.ts:169` emits only `{cycle_id, step, status, exit_code}` even though `execBashStep` already captures stderr at `src/engine/exec-bash.ts:23`. Cycle 0065 extends that single `step.end` emit so that when `r.status === "failed"` AND the step ran via the bash path (`step.agent === "bash"`), the payload also carries a head-capped `stderr` field (2000-char convention, slice to MAX-1 + `…`). Successful events and agent-path events stay unchanged.

## Current Codebase State

### Relevant Components
- Bash exec module: spawns `/bin/bash <abs>`, captures both streams, returns `{status, exitCode, stdout, stderr}` — `src/engine/exec-bash.ts:1-33`. `StepResult.stderr` is already populated on every call (`src/engine/exec-bash.ts:9, 21, 23, 28-29`).
- The single `step.end` emit seam: `src/engine/run-cycle.ts:169` — `await log.emit("step.end", { cycle_id: cycleId, step: step.name, status: r.status, exit_code: r.exitCode });`. This is the only `step.end` emitter in the engine — bash and agent paths converge here.
- Step dispatcher: `src/engine/run-cycle.ts:138-168` — bash path at line 139-140 (`step.agent === "bash"`); agent path at 141-167 (claudecode/codex/gemini via `resolveAgent`). Both branches assign into `r: StepResult` of the same shape; agent path's `r.stderr` is also set in error fallthroughs (e.g. `UnknownAgentError` at line 147, spec-guard at line 161).
- Failure-branch dispatch (after `step.end` emits): `src/engine/run-cycle.ts:170-181` — reflection skipped at 171-174, documentation skipped at 175-178, otherwise `cycle.end status:"failed"` at 179 and return at 180.
- Logger: append-only JSONL via `appendFile`; accepts arbitrary payload keys; no schema layer — `src/engine/log.ts:1-19`. Adding a new optional field requires no logger change.

### Existing Patterns to Follow
- **2000-char head-cap convention** for stderr-like payloads: `src/engine/triage.ts:231-233`:
  ```
  const MAX_ERR_LEN = 2000;
  const truncate = (s: string) =>
    s.length > MAX_ERR_LEN ? s.slice(0, MAX_ERR_LEN - 1) + "…" : s;
  ```
  Used by `engine.paused {reason:"all_triage_failed", last_errors[].error}`. Boundary: at `MAX_ERR_LEN` chars exactly → no truncation; at `MAX_ERR_LEN+1` → slice to 1999 + `…` (total 2000). SPEC pins reusing this convention via an inlined local constant in `run-cycle.ts` and cross-linking the triage helper in REFLECTION.md (do not refactor a shared helper this cycle).
- **Conditional payload-key spread**: `src/engine/run-cycle.ts:136` already uses the `...(headSha ? { head_sha: headSha } : {})` idiom to add an optional key to a `log.emit` payload. The same shape applies cleanly to a conditional `stderr` add.
- **StepResult shape contract**: `src/engine/exec-bash.ts:5-10` defines `StepResult`; the bash path always populates `stderr` (string, possibly empty). Agent-path callers may not — but the SPEC keeps the agent-path `step.end` shape unchanged, so the conditional must gate on `step.agent === "bash"` AND `r.status === "failed"`, not on `r.stderr` truthiness.
- **Recording-logger test pattern**: existing tests assert via `readFile(".cycle/log.jsonl")` + `assert.match(log, /…/)` against the emitted JSONL (e.g. `tests/engine/run-cycle.test.ts:71, 167-174`). The bash-step-fails test at `tests/engine/run-cycle.test.ts:126-179` is the direct precedent — drives a real `#!/bin/bash\necho boom\nexit 1\n` script (line 148) and asserts the `step.end status:"failed" failing_step:"boom"` line. New tests slot in next to that test, asserting on the new `stderr` field via the same readFile-then-match approach.
- **Real-bash-script-over-mocks**: every bash step.end test in `tests/engine/run-cycle.test.ts` writes an executable shell script to `<root>/.cycle/scripts/` (e.g. lines 51-53, 148-149, 199-201, 415-416, 460-468) and drives the full `runCycle` → `execBashStep` → `log.emit` seam. SPEC's testing strategy section reaffirms this — drive real bash scripts, not mocked `execBashStep`.
- **workflowYml helper** at `tests/engine/run-cycle.test.ts:15-28` wraps a steps-body string in the full engine/triage/workflows YAML scaffold; reuse for new tests.

### Dependencies & Integration Points
- `StepResult.stderr` from `src/engine/exec-bash.ts:9` → read at the new conditional in `src/engine/run-cycle.ts:169`.
- `log.emit` (logger interface) — `src/engine/log.ts:5` `(event, fields: Record<string, unknown>) => Promise<void>` — accepts any extra key with no schema gate.
- `step.agent` from `src/engine/workflow.ts` (workflow loader; not modified). Read at `src/engine/run-cycle.ts:135, 139` already.
- Failure-branch downstream consumers of `step.end`:
  - `src/engine/log-tail.ts` parses `step.end` for resume; only reads `step` name and (in `findPriorStepHeadSha`) `step.start.head_sha`. Adding an unknown `stderr` field to `step.end` is inert there.
  - `cycle status` (`src/cli.ts` → `src/engine/log-tail.ts`) renders the in-flight line from `log.jsonl` tail — does not key off step.end fields beyond status.
  No consumer treats `step.end` as a fixed-shape schema; the optional field is additive and safe.

### Test Infrastructure
- Test framework: Node native `node:test` + `node:assert/strict`. Spec reporter via `npm test` (auto-builds `dist/` via `pretest`).
- Test conventions: one `test("…", async () => { … })` per scenario; `mkdtemp(tmpdir())` for isolated repo roots; `git init -b main` + initial commit; YAML scaffold via `workflowYml`; `chmod 0o755` for executable scripts; finally-block cleanup with `rm({recursive:true, force:true})`.
- File layout: `tests/engine/` mirrors `src/engine/`. Bash-step-end tests live in `tests/engine/run-cycle.test.ts` (1552 lines, ~30 tests). Standalone `execBashStep` tests live in `tests/engine/exec-bash.test.ts` (38 lines, 2 tests — happy path + non-zero exit; neither inspects `r.stderr`).
- Coverage gates: line ≥ 95%, branch ≥ 75%, func ≥ 90% (global). Per-file floor: `src/engine/triage.ts ≥ 95%` (enforced by `scripts/coverage-gate.mjs` → `FLOORS` table). `src/engine/run-cycle.ts` has no per-file floor today; new conditional code must keep the global line+branch gates green.
- Current coverage of the change area: the failed-bash-step path is already exercised by `tests/engine/run-cycle.test.ts:126-179` (the `boom.sh exit 1` test); new tests will add assertions on the stderr payload at that same seam.

## Code References
- `src/engine/run-cycle.ts:169` — the single `step.end` emit; extension point for the new conditional `stderr` field.
- `src/engine/run-cycle.ts:139-140` — bash-path branch (`step.agent === "bash"` → `r = await execBashStep(...)`). The `step.agent === "bash"` predicate is the same one the new conditional must use.
- `src/engine/run-cycle.ts:138` — `let r: StepResult;` declaration; both branches assign here.
- `src/engine/run-cycle.ts:136` — precedent for conditional-spread payload key (`...(headSha ? { head_sha: headSha } : {})`).
- `src/engine/exec-bash.ts:9` — `StepResult.stderr: string` (always populated by the bash path).
- `src/engine/exec-bash.ts:23` — `child.stderr.on("data", d => { stderr += d.toString(); });` — the capture site.
- `src/engine/exec-bash.ts:28-29` — `stderr` returned in the resolved `StepResult` for both ok and failed exits.
- `src/engine/triage.ts:231-233` — the 2000-char head-cap helper to mirror inline.
- `src/engine/log.ts:11-16` — `log.emit(event, fields)` accepts any payload keys.
- `tests/engine/run-cycle.test.ts:126-179` — boom.sh exit-1 test; closest existing precedent for asserting on failed bash `step.end`.
- `tests/engine/run-cycle.test.ts:148` — `#!/bin/bash\necho boom\nexit 1\n` — pattern for a real failing bash script (currently echoes to stdout, not stderr; new tests will use `echo … >&2`).
- `tests/engine/run-cycle.test.ts:71, 173, 218` — `assert.match(log, /"event":"step.end"[…]"status":"…"/)` regex precedent for asserting on emitted JSONL lines.
- `tests/engine/run-cycle.test.ts:15-28` — `workflowYml` helper used by every test.

## Open Questions
- **Agent-path masking verification (SPEC out-of-scope but BUILD.md must report).** SPEC asks the build step to "verify in BUILD.md whether the same masking applies" for `claudecode` / `codex` / `gemini`. Inspection of `src/engine/run-cycle.ts:141-167` shows agent results also flow through the same `step.end` emit at line 169 with no `stderr`; the agent-path `r.stderr` is populated in error fallthroughs (UnknownAgentError at 147, spec-guard at 161) and by each provider module. The plan/build step should decide whether to extend the conditional to the agent path (still gated to `r.status === "failed"`) or strictly limit it to `step.agent === "bash"` per the SPEC's literal scope. SPEC's wording ("AND the step ran via the bash path") favors strict bash-only; agent-path coverage is a follow-up issue, not this cycle.
- **`r.stderr` may be empty string on bash failure.** If a bash script exits non-zero without writing to stderr, `r.stderr === ""`. SPEC requires `stderr` on every failed bash `step.end`. Plan/build must decide whether to emit `stderr: ""` literally (consistent shape) or to suppress the key when empty. The acceptance criterion "captured stderr matches the child output (exact string for sub-cap payloads)" implies emitting the literal captured value including `""` — the planner should confirm.
- **Where the new tests live.** SPEC suggests `tests/engine/run-cycle.test.ts` or a sibling under `tests/engine/`. The existing file is already 1552 lines; the planner may prefer a new `tests/engine/run-cycle.step-end-stderr.test.ts` mirroring the `run-cycle.spec-guard.test.ts` / `run-cycle.sanitize.test.ts` / `run-cycle.documentation.test.ts` / `run-cycle.reflection.test.ts` pattern. Either is conformant; no SPEC-level constraint.
- **Truncation test setup.** Producing a ≥ 2001-char stderr from a bash script is straightforward (e.g. `head -c 2001 /dev/urandom | base64 | head -c 2001 >&2`), but encoding bytes to a JSONL line and re-parsing for `assert` may need careful escaping. The existing tests use simple regex matches against the file contents; the planner should pick a strategy that survives JSON.stringify round-tripping (e.g. read the line, `JSON.parse`, then assert `parsed.stderr.length === 2000 && parsed.stderr.endsWith("…")`).
- **Documentation surface confirmation.** SPEC pins a one-line CLAUDE.md note under "Architecture quick reference" and skips README. No `docs/**/*.md` files describe `step.end` payload shape today (verified by absence of "step.end" mentions outside `src/`, `tests/`, and `docs/cycle/*` artifacts) — the planner should reconfirm during documentation step.
