# Research: Cycle 0007

## Cycle Context
SPEC.md asks to make the `claudecode` and `gemini` exec modules forward `--model <model>` to their CLI subprocesses when a non-empty `model` is set, and to omit the flag when `model` is falsy (undefined/empty). The `model` step field is already plumbed from `run-cycle.ts` into `mod.runStep({ model })` (and fed by the `defaults.model` resolution from cycle 0006), but `exec-claudecode.ts` and `exec-gemini.ts` currently discard it, making per-step / default model selection a no-op for these two agents. For `claudecode` the flag must be inserted before the trailing `-p` (so `-p` stays last); for `gemini` the flag is appended to the otherwise-empty argv (stdin prompt delivery). Neither module may emit `--thinking`. Rate-limit handling and prompt-delivery mode must be preserved. Tests must assert presence-when-set, absence-when-unset, the empty-string edge case, claudecode `-p`-last ordering, and that no `--thinking` is emitted. Docs (CLAUDE.md, ENGINE.md, exec.ts comments) must be corrected to reflect the new behavior.

## Current Codebase State

### Relevant Components
- `claudecodeExec` module — builds argv `["--permission-mode", "auto"]`, optionally pushes `--append-system-prompt <value>`, then pushes `-p`; runs via `runAgent` with `promptDelivery: "argv"`; wraps result with rate-limit detection. Does **not** destructure or forward `model`/`thinking` — `src/engine/exec-claudecode.ts:5-19`.
- `geminiExec` module — calls `runAgent({ binary: "gemini", argv: [], promptDelivery: "stdin", ...args })`; does **not** destructure `model`/`thinking` at all (spreads them through `args` but never reads them into argv) — `src/engine/exec-gemini.ts:5-11`.
- `codexExec` module — the closest precedent for forwarding: destructures `{ model, thinking, ...args }`, `if (model) argv.push("--model", model)`, `if (thinking) argv.push("--thinking", thinking)`, model pushed before thinking — `src/engine/exec-codex.ts:5-14`.
- `auggieExec` module — the precedent the SPEC cites for forwarding `model` while ignoring `thinking`: destructures `{ model, thinking, ...args }`, `if (model) argv.push("--model", model)`, and the `thinking` param is intentionally unused (comment at top) — `src/engine/exec-auggie.ts:5-17`.
- `runAgent` — shared spawn wrapper; takes `{ binary, argv, promptDelivery, promptPath, repoRoot, env?, signal? }`. For `promptDelivery: "argv"` it reads the prompt file and appends the prompt body as the final element (`finalArgv = [...argv, prompt]`), confirming that for claudecode the `-p` and prompt must be argv-tail; for `"stdin"` it pipes the prompt body to stdin and leaves argv untouched — `src/engine/exec-spawn.ts:18-53`.
- `ExecModule` interface — `runStep` accepts `{ repoRoot, promptPath, env?, model?, thinking?, appendSystemPrompt? }`; all three optional fields already exist in the signature — `src/engine/exec.ts:9-29`.
- Dispatch — `run-cycle.ts` resolves the agent via `resolveAgent(step.agent)` and calls `mod.runStep({ repoRoot, promptPath: step.prompt!, env: cycleEnv, model: step.model, thinking: step.thinking, appendSystemPrompt: appendSP })`. `model: step.model` is already wired — `src/engine/run-cycle.ts:340-348`.

### Existing Patterns to Follow
- Conditional flag push pattern: `if (model) argv.push("--model", model);` — guards on truthiness, so empty string / undefined are skipped automatically (satisfies the "treat falsy as unset" requirement). Used by codex (`src/engine/exec-codex.ts:8`) and auggie (`src/engine/exec-auggie.ts:12`).
- claudecode argv ordering: flags are pushed onto `argv` and `-p` is pushed last so that `runAgent`'s argv-mode appends the prompt after `-p`. `--append-system-prompt` is inserted before `-p` (`src/engine/exec-claudecode.ts:12-14`); SPEC requires `--model` inserted in the same before-`-p` region.
- Destructure-then-spread idiom: modules that consume params pull them off via `runStep({ model, thinking, ...args })` and spread the remaining `...args` into `runAgent` (`src/engine/exec-codex.ts:6,10`; `src/engine/exec-auggie.ts:9,13`). gemini currently uses bare `runStep(args)` and must switch to this idiom to consume `model` without leaking it into `runAgent` (which does not accept `model`).
- Failure handling: each agent module calls `isRateLimitError(r)` after `runAgent` returns and, when true, returns `{ ...r, status: "failed", rateLimited: true as const }`; otherwise returns `r` verbatim. Non-zero exits surface as `status: "failed"` with captured stderr from `runAgent` (`src/engine/exec-spawn.ts:41-46`). No module adds its own swallow point — `src/engine/exec-claudecode.ts:16-17`, `src/engine/exec-gemini.ts:8-9`, `src/engine/rate-limit.ts` (`isRateLimitError`).
- Observability: these exec modules emit no logs/events themselves; structured events (`.cycle/log.jsonl`) are emitted by `run-cycle.ts` (e.g. `step.end`, `step.warning`, `engine.paused`/`engine.resumed` for rate limits). Failed `step.end` events carry head-capped stderr from the module's `StepResult` (`docs/ENGINE.md:173`). No metric counters are involved in the change area.
- Idempotency / retry-safety: none internal to these modules — they are pure argv-builders + spawn. Rate-limit retry orchestration (pause/sleep/retry, `engine.paused {reason:"rate_limit"}`) lives entirely in `run-cycle.ts` and depends only on the `rateLimited: true` flag the module returns (`src/engine/run-cycle.ts:357+`); preserving that flag preserves retry-safety.

### Dependencies & Integration Points
- `runAgent` (`src/engine/exec-spawn.ts`) — both modules call it; signature unchanged, already accepts/forwards `argv`.
- `isRateLimitError` (`src/engine/rate-limit.ts`) — already imported by both modules.
- `ExecModule` type (`src/engine/exec.ts`) — already declares `model?`/`thinking?`; no interface change needed.
- `resolveAgent` / `REGISTRY` (`src/engine/exec.ts:39-56`) — registers both modules; unchanged.
- `step.model` plumbing (`src/engine/run-cycle.ts:346`) and `defaults.model` resolution in `loadConfig` (cycle 0006) — already complete; out of scope.

### Test Infrastructure
- Test framework: Node's built-in `node:test` runner with `node:assert` (`strict`). No external test deps.
- Test conventions: per-module test files under `tests/engine/exec-<agent>.test.ts`. Each test creates temp dirs via `mkdtemp`, writes a fake executable shell script into a temp bin dir, points `env.PATH` at it, and asserts on `r.status`/`r.stdout`/`r.stderr`. argv is captured by making the fake binary `echo "$@"` (or `echo ARGS $@`) and matching/splitting `r.stdout`. No `mock.method` is used in these files — real fake binaries instead.
  - argv-presence assertion style: `assert.match(r.stdout, /--model/)` and `assert.match(r.stdout, /o4-mini/)` — `tests/engine/exec-codex.test.ts:61-86`.
  - argv-ordering assertion style: split `r.stdout.trim().split(/\s+/)` and compare `indexOf` positions — `tests/engine/exec-claudecode.test.ts:70-74` (`--append-system-prompt` < `-p`); index-comparison also in `tests/engine/exec-codex.test.ts:135-139`.
  - absence assertion style: `assert.ok(!r.stdout.includes("--append-system-prompt"), ...)` — `tests/engine/exec-claudecode.test.ts:99`.
- Current coverage of the change area: existing `exec-claudecode.test.ts` covers happy path, ENOENT, append-system-prompt present/absent (with ordering vs `-p`), and rate-limit (`tests/engine/exec-claudecode.test.ts:8-129`). `exec-gemini.test.ts` covers happy path, non-zero exit, ENOENT, and rate-limit (`tests/engine/exec-gemini.test.ts:8-104`). Neither file currently has a `--model` test.
- Failure-path test coverage: yes — ENOENT spawn failure, non-zero exit + stderr capture, and rate-limit detection are all tested for both modules (codex/auggie additionally test `--model`/`--thinking` argv). The new empty-string `model: ""` edge-case test (argv excludes `--model`) does not yet exist for either module.
- Coverage floors: CLAUDE.md's per-file `FLOORS` table lists no entry for `exec-claudecode.ts` or `exec-gemini.ts`; global floors (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%) and "must not decrease" apply. Coverage enforced via `npm run test:coverage` → `scripts/coverage-gate.mjs`.

## Code References
- `src/engine/exec-claudecode.ts:6-18` — `runStep` destructures `{ appendSystemPrompt, ...args }` (no `model`); builds argv, pushes `-p` last, spawns `argv`-delivery, rate-limit-wraps result.
- `src/engine/exec-gemini.ts:6-10` — `runStep(args)` with empty argv, `stdin` delivery; never reads `model`/`thinking`.
- `src/engine/exec-codex.ts:6-13` — forwarding precedent (`--model` then `--thinking`, both guarded by truthiness).
- `src/engine/exec-auggie.ts:9-15` — forwarding precedent that maps `model` but intentionally ignores `thinking` (matches SPEC's required claudecode/gemini behavior).
- `src/engine/exec-spawn.ts:25-30` — argv-mode appends prompt as final element (why `-p` must stay last for claudecode); stdin-mode leaves argv untouched.
- `src/engine/exec.ts:21-28` — `ExecModule.runStep` param shape (`model?`, `thinking?` already present).
- `src/engine/run-cycle.ts:340-348` — dispatch passing `model: step.model` and `thinking: step.thinking` into `runStep`.
- `tests/engine/exec-codex.test.ts:61-146` — `--model` presence + `--model`/`--thinking` ordering test templates to mirror.
- `tests/engine/exec-claudecode.test.ts:49-104` — append-system-prompt present/absent + `-p` ordering tests to mirror for `--model`.
- `docs/ENGINE.md:11` — states "`codex`, `auggie`, `opencode`, and `pi` agents accept optional `model` and `thinking`" (claudecode/gemini omitted); must be corrected per SPEC Documentation Updates.
- `docs/ENGINE.md:173` — lists exec modules whose non-zero exit sets head-capped stderr (includes claudecode/codex/gemini); confirms failure-surfacing convention, no change needed.
- `docs/ENGINE.md:263` — rate-limit `StepResult.rateLimited` contract across the six agent modules; confirms the rate-limit pattern that must be preserved.
- `CLAUDE.md` Architecture "Registered step agents" note — claudecode/gemini entries do not currently say `model` maps to `--model`; must be updated per SPEC.

## Open Questions
- Exact insertion point of `--model` relative to `--append-system-prompt` in claudecode argv: SPEC says "positioned before the trailing `-p` (consistent with `--append-system-prompt` ordering)" but does not pin whether `--model` precedes or follows `--append-system-prompt`. Either ordering satisfies the stated requirements (both before `-p`); the planner should choose and pin it in a test.
- Whether a separate test should assert `-p`-last in the combined case (`--model` + `--append-system-prompt` both present) in addition to the individual cases — the Acceptance Criteria call for `-p`-last "with and without `--model` and with and without `appendSystemPrompt`," implying coverage of the combined permutation.
