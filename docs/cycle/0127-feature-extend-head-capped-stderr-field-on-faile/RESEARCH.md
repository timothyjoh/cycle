Enough context gathered. Writing RESEARCH.md now.

```markdown
# Research: Cycle 0127

## Cycle Context

Cycle 0127 adds regression tests for three agent-path failure shapes (spec post-condition guard, provider non-zero exit, over-2000-byte truncation) that were explicitly deferred in the cycle 0065 review. The production gate in `run-cycle.ts` is already `r.status === "failed"` (not bash-only); no production code changes are needed. The deliverables are: new tests appended to `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts`, and a prose update to `docs/ENGINE.md` § "Failed step.end stderr" enumerating all three emission sites.

## Current Codebase State

### Relevant Components

- **`run-cycle.ts` — step.end emission gate**: `r.status === "failed"` (universal) — `src/engine/run-cycle.ts:239–246`. The spread `...(r.status === "failed" ? { stderr: truncateStepEndStderr(r.stderr) } : {})` applies to bash AND agent paths identically.
- **`run-cycle.ts` — UnknownAgentError dispatch path**: `src/engine/run-cycle.ts:215–218`. `resolveAgent(step.agent)` throws; catch block sets `r = { status: "failed", exitCode: -1, stdout: "", stderr: err.message }`.
- **`run-cycle.ts` — spec post-condition guard**: `src/engine/run-cycle.ts:222–233`. After agent returns `ok`, writes artifact, then if `step.name === "spec"` and `Buffer.byteLength(sanitized) < SPEC_MIN_BYTES`, mutates `r.status = "failed"` and `r.stderr = formatSpecGuardError(...)`.
- **`run-cycle.ts` — exports**: `SPEC_MIN_BYTES` (200), `MAX_STEP_END_STDERR` (2000), `truncateStepEndStderr`, `formatSpecGuardError` all exported — `src/engine/run-cycle.ts:47–55`.
- **`exec.ts` — registry + UnknownAgentError**: `resolveAgent`, `UnknownAgentError` exported — `src/engine/exec.ts:14–32`. Known agents: `claudecode`, `codex`, `gemini`.
- **`exec-claudecode.ts`**: spawns `claude` binary, captures stdout/stderr streams, resolves `{ status: code === 0 ? "ok" : "failed", exitCode, stdout, stderr }` — `src/engine/exec-claudecode.ts:8–41`.
- **`exec-codex.ts`**: same shape, spawns `codex`, feeds prompt via stdin — `src/engine/exec-codex.ts:8–47`.
- **`exec-gemini.ts`**: same shape, spawns `gemini`, feeds prompt via stdin — `src/engine/exec-gemini.ts:8–47`.
- **`docs/ENGINE.md` § "Failed step.end stderr"**: lines 80–82. Currently two sentences: names the 2000-char cap, `MAX_STEP_END_STDERR`, `truncateStepEndStderr`, and `r.status === "failed"` gate. Does NOT enumerate the three emission sites; does NOT mention agent-path sources.

### Existing Tests

- **`tests/engine/run-cycle.step-end-stderr-dispatch.test.ts`** (155 lines): five tests covering:
  1. `failed dispatch step.end carries verbatim UnknownAgentError stderr` (line 63) — uses `resolveAgent("bogus")` to get expected message, creates workflow with `agent: bogus`.
  2. `successful agent step.end omits stderr key` (line 102) — fake `claude` binary on PATH exits 0.
  3. Three unit tests for `truncateStepEndStderr` (lines 136–154).
- **`tests/engine/run-cycle.step-end-stderr.test.ts`** (146 lines): bash-path tests covering ok, verbatim stderr, head-capped flood. Uses a `scripts` array in `setupRepo`.
- Both files use identical `findStepEnd(log, stepName)` helper pattern.

### Existing Patterns to Follow

- **`setupRepo` in dispatch test** (`run-cycle.step-end-stderr-dispatch.test.ts:38–48`): creates tmp dir, `git init -b main`, empty commit, `mkdir .cycle/scripts`, writes `.cycle/workflows.yml`. Does NOT include `scripts` array parameter — fake binaries are created ad-hoc in individual tests (see line 109–115 pattern).
- **Fake binary on PATH pattern** (`run-cycle.step-end-stderr-dispatch.test.ts:109–115`): `mkdtemp`, write `#!/bin/bash\n...\n`, `chmod 0o755`, pass `PATH: \`${bin}:${process.env.PATH}\`` in `runCycle` env. Cleanup in `finally` block with `rm(bin, { recursive: true, force: true })`.
- **`workflowYml(stepsBody)`** (`run-cycle.step-end-stderr-dispatch.test.ts:20–36`): hardcodes `mode: trunk`, `push: false`, `base_branch: main`, `max_consecutive_failures: 2`. Step body is indented 6 spaces.
- **`runCycle` env**: always passes `CYCLE_BASE: "main"` in env to avoid `undefined` base branch.
- **Prompt file required**: for agent steps, `.cycle/prompts/<name>.md` must exist before `runCycle` is called. The `claudecodeExec.runStep` reads the promptPath via `readFile`; missing file will throw ENOENT before spawn — `exec-claudecode.ts:11`.
- **`assert.ok(!("stderr" in parsed))` pattern**: used for success assertions (line 129).

### Dependencies & Integration Points

- `sanitizeArtifactStdout` is called before `Buffer.byteLength` in the spec guard — `run-cycle.ts:223`. The sanitized content (not raw stdout) determines the byte count. A fake `claude` binary that emits short output will produce a short sanitized string.
- `prepareTrunkArtifactDir` creates the artifact directory; it runs when `cfg.engine.commit.mode !== "worktree-pr"` (trunk mode) — `run-cycle.ts:115`. Since `workflowYml` uses `mode: trunk`, artifact dir creation is guaranteed before the spec guard fires.
- Spec guard at `run-cycle.ts:227`: `if (step.name === "spec")` — the workflow step MUST be named exactly `spec` to trigger the guard. Steps named anything else skip the guard entirely.

### Test Infrastructure

- **Framework**: `node:test` + `node:assert/strict`.
- **Build**: `npm test` runs `pretest` (esbuild bundle) then `node --experimental-strip-types --test`.
- **Coverage**: `npm run test:coverage` + `npm run check:coverage`. `src/engine/run-cycle.ts` has NO per-file floor in `scripts/coverage-gate.mjs` (floors are only for `triage.ts`, `issue-lifecycle.ts`, `commit-cycle.ts`, `branch.ts`, `stale-dist.ts`, `run-one.ts`). The SPEC requires line/branch not regress vs master baseline (≥95% line, ≥75% branch per CLAUDE.md).
- **Import style**: TypeScript source imported directly with `.ts` extension (no transpile step in tests).
- **Teardown**: always `rm(root, { recursive: true, force: true })` in `finally`; fake bin dirs get a second `rm` call.

### `refl-0029` Coordination

- `docs/cycle/issues/done/refl-0029-spec-acceptance-bullet-6-deferred-to-wro.md` exists — AC-6 is already satisfiable; BUILD.md just needs a sentence citing it.

## Code References

- `src/engine/run-cycle.ts:47` — `export const SPEC_MIN_BYTES = 200`
- `src/engine/run-cycle.ts:49–51` — `MAX_STEP_END_STDERR` (2000) and `truncateStepEndStderr` export
- `src/engine/run-cycle.ts:53–55` — `formatSpecGuardError(path, bytes, threshold): string`
- `src/engine/run-cycle.ts:212–218` — UnknownAgentError catch sets `r.stderr = err.message`
- `src/engine/run-cycle.ts:222–233` — spec post-condition guard: writes artifact, measures bytes, mutates `r.status`/`r.stderr` if `< SPEC_MIN_BYTES`
- `src/engine/run-cycle.ts:239–246` — `step.end` emission; spread includes `stderr` iff `r.status === "failed"`
- `src/engine/exec.ts:14–20` — `UnknownAgentError` constructor: `super(\`agent "${name}" is not registered; known agents: ${list}\`)`
- `src/engine/exec.ts:28–32` — `resolveAgent` throws `UnknownAgentError` for unregistered names
- `src/engine/exec-claudecode.ts:13` — spawns `claude` binary; `stdio: ["ignore", "pipe", "pipe"]`
- `src/engine/exec-claudecode.ts:23–28` — `close` handler: `status: code === 0 ? "ok" : "failed"`, `stderr` from stream
- `src/engine/exec-codex.ts:13` — spawns `codex`; stdin receives prompt
- `src/engine/exec-gemini.ts:13` — spawns `gemini`; stdin receives prompt
- `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts:20–48` — `workflowYml`/`setupRepo` helpers
- `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts:50–61` — `findStepEnd` helper
- `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts:109–115` — fake `claude` binary creation pattern
- `docs/ENGINE.md:80–82` — current § "Failed step.end stderr" (two sentences, no emission-site list)
- `scripts/coverage-gate.mjs:12–19` — FLOORS table (run-cycle.ts not gated)

## Open Questions

- The SPEC says fake `claude` binary for AC-1 exits 0 with stdout shorter than 200 bytes. `formatSpecGuardError` populates `r.stderr` — but the fake binary emits nothing to stderr. Does `r.stderr` accumulate the empty string from the stream, then get overwritten by `formatSpecGuardError`? Confirmed yes: `r.stderr` is set to `formatSpecGuardError(artifactPath, bytes, SPEC_MIN_BYTES)` at `run-cycle.ts:231`. The planner should verify the expected string contains the artifact path segment to make the assertion resilient.
- AC-2 specifies confirming `step.end.stderr === "agent failed: detail\n"` verbatim. The fake `claude` binary needs to write to stderr and exit 1 — `claudecodeExec` captures stderr via stream. No truncation since `< 2000 chars`. Pattern is identical to the `flood` bash test except using a fake `claude` binary on PATH.
- AC-3 uses 2500 `x` chars — same count as existing `truncateStepEndStderr` unit test. Planner must emit to stderr (not stdout) and exit 1. The printf loop approach from `flood.sh` in bash tests works; for agent path, embed it in the fake `claude` script body.
- The `workflowYml` helper in the dispatch test does not create a `.cycle/prompts/` directory. Each test that uses a real agent step (not `bogus`) must create the prompt file and its parent dir before calling `runCycle`. The planner must replicate this in all three new tests (pattern at dispatch test lines 111–115).
```
