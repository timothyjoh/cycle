I have all the information needed. Writing the research document now.

# Research: Cycle 0218

## Cycle Context

Cycle 0218 addresses persistent artifact contamination caused by the session-level learning-mode framing (injected via `SessionStart` hook) overriding prompt-text `## File Artifact Mode` guardrails at invocation time. The cycle scopes two complementary fixes: Option A injects `--append-system-prompt` into the Claude CLI invocation for all artifact-producing steps (using an `ARTIFACT_STEPS` constant in `run-cycle.ts` to detect them), and Option B adds explicit WRONG/CORRECT negative examples to the six artifact prompts that do not yet have one (spec.md received a concrete negative example in cycle 0217). Regression gate is unit tests at the argv-assertion level.

## Current Codebase State

### Relevant Components

- **Artifact-write seam** — `run-cycle.ts:293-309` — where `mod.runStep()` is called for all non-bash steps; the result is passed through `sanitizeArtifactStdout` and written to `<artifactDir>/<STEP>.md`. This is the earliest point where invocation-layer suppression can be injected.
- **Step-set constants** — `run-cycle.ts:27-33` — two `Set<string>` constants (`RESET_ELIGIBLE_STEPS`, `SKIP_ELIGIBLE_STEPS`) categorize steps for engine behavior. `ARTIFACT_STEPS` does not yet exist.
- **claudecodeExec** — `src/engine/exec-claudecode.ts:4-8` — thin 8-line wrapper over `runAgent`; hardcodes `argv: ["--dangerously-skip-permissions", "-p"]`. No mechanism to inject extra flags.
- **ExecModule interface** — `src/engine/exec.ts:10-17` — `runStep(args)` accepts `{repoRoot, promptPath, env?, model?, thinking?}`. No `appendSystemPrompt` field.
- **runAgent** — `src/engine/exec-spawn.ts:17-46` — builds the child spawn from `{binary, argv, promptDelivery, promptPath, repoRoot, env?, signal?}`. Prompt is appended as the final argv element for `argv` delivery. Extra pre-prompt flags can be prepended to the `argv` array.
- **Artifact sanitizer** — `src/engine/sanitize-artifact.ts:1-18` — strips leading narration lines matching `NARRATION_LINE` regex and unwraps outer fences. Applied at the write seam (`run-cycle.ts:307`). Does not address contamination at mid-document or structural-incompleteness level.
- **cycleEnv** — `run-cycle.ts:207-213` — env vars injected into every step: `CYCLE_ID`, `CYCLE_TITLE`, `CYCLE_BASE`, `CYCLE_ISSUE_ID`. Passed to `mod.runStep` as `env: cycleEnv`.

### Prompt File Artifact Mode Coverage

| Prompt | File | FAM Section | Negative Example |
|---|---|---|---|
| spec | `src/defaults/prompts/spec.md:117` | Yes | Yes (cycle 0217 inline prose, no WRONG:/CORRECT: labels) |
| plan | `src/defaults/prompts/plan.md:137` | Yes | No |
| review | `src/defaults/prompts/review.md:109` | Yes | No |
| build | `src/defaults/prompts/build.md:66` | Yes | No |
| research | `src/defaults/prompts/research.md:38` | Yes | No |
| fix | `src/defaults/prompts/fix.md:45` | Yes | No |
| documentation | `src/defaults/prompts/documentation.md:59` | Yes | No |

### Claude CLI System-Prompt Flags

`claude --help` exposes:
- `--append-system-prompt <prompt>` — appends text to the default system prompt; compatible with the default system prompt (does NOT replace it)
- `--system-prompt <prompt>` — replaces the system prompt entirely

`--append-system-prompt` is the safe flag for Option A: it adds the suppression directive on top of whatever session-level framing is active without removing `CLAUDE.md` loading or other default behaviors.

### Artifact Step Dispatch in run-cycle.ts

`run-cycle.ts:296-298`:
```typescript
const mod = resolveAgent(step.agent);
r = await mod.runStep({ repoRoot, promptPath: step.prompt!, env: cycleEnv, model: step.model, thinking: step.thinking });
```

The `step.name` is available at this call site but is not currently forwarded to `runStep`. The seven artifact-producing step names (as used in `workflows.yml:20-28`) are: `spec`, `research`, `plan`, `build`, `review`, `fix`, `documentation`.

### Existing Patterns to Follow

- **Optional field on runStep**: `model` and `thinking` are optional fields on `ExecModule.runStep` — `exec.ts:14-15`. They are forwarded from `step.model` / `step.thinking` in `run-cycle.ts:298`, and consumed only by exec modules that support them (codex, auggie, opencode, pi). Unused by `claudecodeExec`. `appendSystemPrompt?: string` would follow this exact pattern.
- **Per-provider argv construction**: `exec-codex.ts:5-10` shows the pattern for conditionally extending `argv` based on optional fields: `if (model) argv.push("--model", model)`. `claudecodeExec` would add `if (appendSystemPrompt) argv.push("--append-system-prompt", appendSystemPrompt)` before the `-p` flag.
- **Dogfood mirror constraint**: Every `src/defaults/prompts/*.md` change must be mirrored to `.cycle/prompts/` via `npm run sync-defaults`. Tests pin byte-identity.
- **Step-set constant pattern**: `RESET_ELIGIBLE_STEPS` and `SKIP_ELIGIBLE_STEPS` use `new Set([...])` at module scope in `run-cycle.ts:27-33`. `ARTIFACT_STEPS` would follow identical structure.

### Dependencies & Integration Points

- `exec.ts` — `ExecModule` interface must gain `appendSystemPrompt?: string` to thread the value from `run-cycle.ts` through to `claudecodeExec`. Other modules (codex, gemini, auggie, opencode, pi) receive the field and ignore it.
- `exec-claudecode.ts` — consumes `appendSystemPrompt` from `runStep` args and conditionally prepends `["--append-system-prompt", appendSystemPrompt]` to argv before `-p`.
- `exec-spawn.ts:RunAgentOptions` — does NOT need to change; the extra flag is prepended to `argv` by the caller before passing to `runAgent`, same as codex's `--model`/`--thinking` approach.
- `run-cycle.ts` — adds `ARTIFACT_STEPS` set; at the `mod.runStep()` call site, computes the suppression text and passes it as `appendSystemPrompt` when `ARTIFACT_STEPS.has(step.name)`.
- `src/defaults/workflows.yml` + `.cycle/workflows.yml` — no changes needed; artifact step detection is code-side, not config-side.
- `npm run sync-defaults` — required after editing any `src/defaults/prompts/*.md`.

### Test Infrastructure

- **Test framework**: Node.js built-in `node:test` with `node:assert/strict`. No transpile step; TypeScript run via `--experimental-strip-types`.
- **Test directories**: `tests/engine/` (engine unit tests), `tests/defaults/` (prompt content assertion tests).
- **Exec module test pattern**: `tests/engine/exec-claudecode.test.ts:8-27` — writes a fake `claude` bash script that echoes its args, calls `resolveAgent("claudecode").runStep(...)`, asserts on stdout. This is the argv-assertion pattern the SPEC references.
- **Dogfood byte-identity tests**: Each prompt has a test asserting `Buffer.compare(src, dog) === 0`. Failing sync-defaults will break these tests.
- **Current guardrail test coverage by prompt**:
  - `spec.md`: `tests/defaults/spec-prompt-ac.test.ts:32-60` — 4 tests (file-not-conversation, insight-blocks, confirmation-sentences, concrete negative example)
  - `plan.md`: `tests/defaults/plan-prompt-spec-traceability.test.ts:31-47` — 3 tests (file-not-conversation, insight-blocks, confirmation-sentences); no trailing-commentary test
  - `review.md`: `tests/defaults/review-prompt-spec-ac.test.ts:40-68` — 4 tests (FAM header, insight-blocks, confirmation-sentences, trailing-commentary)
  - `build.md`, `research.md`, `fix.md`, `documentation.md`: `tests/defaults/file-artifact-mode-guardrail.test.ts` — 5 tests each (file-not-conversation, insight-blocks, confirmation-sentences, trailing-commentary, dogfood byte-identity)
- **No existing argv-level test** asserts that `--append-system-prompt` appears in the claudecode spawn when an artifact step is invoked.

## Code References

- `src/engine/exec-claudecode.ts:4-8` — claudecodeExec: hardcoded argv, no mechanism for extra flags
- `src/engine/exec.ts:10-17` — ExecModule.runStep interface; `model?` and `thinking?` are the extension precedent
- `src/engine/exec.ts:27-34` — REGISTRY mapping agent names to ExecModule implementations
- `src/engine/exec-codex.ts:5-10` — optional argv extension pattern (model/thinking flags)
- `src/engine/exec-spawn.ts:7-15` — RunAgentOptions interface
- `src/engine/exec-spawn.ts:21` — `finalArgv = [...argv, prompt]` — extra flags in `argv` appear before the prompt body
- `src/engine/run-cycle.ts:27-33` — RESET_ELIGIBLE_STEPS / SKIP_ELIGIBLE_STEPS set constants
- `src/engine/run-cycle.ts:207-213` — cycleEnv construction
- `src/engine/run-cycle.ts:293-309` — artifact-write seam: `mod.runStep()` call and sanitize/write path
- `src/engine/sanitize-artifact.ts:1` — NARRATION_LINE regex (strips leading narration post-invocation)
- `src/defaults/prompts/spec.md:117-146` — FAM section with inline negative example (no WRONG:/CORRECT: labels)
- `src/defaults/prompts/plan.md:137-160` — FAM section, no negative example
- `src/defaults/prompts/review.md:109-126` — FAM section, no negative example
- `src/defaults/prompts/build.md:66-84` — FAM section, no negative example
- `src/defaults/prompts/research.md:38-55` — FAM section, no negative example
- `src/defaults/prompts/fix.md:45-62` — FAM section, no negative example
- `src/defaults/prompts/documentation.md:59-75` — FAM section, no negative example
- `tests/engine/exec-claudecode.test.ts:8-27` — fake-binary argv-assertion test pattern
- `tests/defaults/file-artifact-mode-guardrail.test.ts` — 20 tests covering build/research/fix/documentation guardrail presence + dogfood byte-identity
- `src/defaults/workflows.yml:19-28` — feature workflow; artifact step names: spec, research, plan, build, review, fix, documentation

## Open Questions

- **Suppression prompt text**: What exact text should be passed as `--append-system-prompt` to suppress learning-mode narration? The text must be short enough to not conflict with the existing prompt body, and must specifically cancel the `SessionStart` hook's narration/explanation instructions. No canonical suppression template exists in the codebase.
- **Non-claudecode agents**: The `appendSystemPrompt` field would be silently ignored by codex/gemini/auggie/opencode/pi (which do not use the Claude CLI). If those agents are ever used for artifact steps, the suppression will not apply. No mechanism exists to warn when `appendSystemPrompt` is passed to an agent that ignores it.
- **spec.md negative example format**: The existing spec.md negative example uses inline prose without WRONG:/CORRECT: labels. Option B should decide whether to normalize spec.md's example to the same WRONG:/CORRECT: format as the other six prompts, or keep spec.md's existing format and add the labeled format only to the remaining six.
- **plan.md trailing-commentary test gap**: `plan-prompt-spec-traceability.test.ts` has 3 guardrail tests but lacks the trailing-commentary assertion present in the review/build/research/fix/documentation tests. Whether to add this test as part of cycle 0218 or leave it for a separate cycle is unresolved.
