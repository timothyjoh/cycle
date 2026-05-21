# Research: Cycle 0217

## Cycle Context

This cycle fixes the recurring SPEC.md contamination problem: despite a `## File Artifact Mode` guardrail in `src/defaults/prompts/spec.md` since cycle 0212, the spec step has produced contaminated SPEC.md artifacts in cycles 0213, 0214, 0215, and 0217. The contamination is always the same pattern: `SPEC.md written to \`docs/cycle/...\`.\n\nSingle deliverable: ...` — a single-sentence or two-sentence narrative preamble with no structured sections. The scoped fix is twofold: (1) extend `sanitizeArtifactStdout` in `src/engine/sanitize-artifact.ts` to strip these observed patterns, and (2) add concrete negative examples of contamination to `spec.md`'s `## File Artifact Mode` section. Invocation-layer suppression is deferred.

## Current Codebase State

### Relevant Components

- **Sanitize module**: `src/engine/sanitize-artifact.ts:1–14` — single exported function `sanitizeArtifactStdout(stdout)`. Current `NARRATION_LINE` regex: `/^(Now|Next|Here is|Output)\b[^\n]*(?:\n|$)/`. Does NOT match lines starting with `SPEC.md`, `Single deliverable:`, or `SPEC written to`.
- **Artifact write seam**: `src/engine/run-cycle.ts:307–309` — `sanitizeArtifactStdout(r.stdout)` is called at the single write point for all artifact-producing agent steps (spec, research, plan, build, fix, documentation, review).
- **Spec prompt template (source)**: `src/defaults/prompts/spec.md` — contains `## File Artifact Mode` section prohibiting insight blocks, star-marker commentary, and confirmation sentences. Lists `"Spec written to…"` and `"I have written the spec"` as prohibited examples. Does NOT include concrete negative examples showing the observed `"SPEC.md written to \`...\`."` pattern.
- **Spec prompt template (dogfood)**: `.cycle/prompts/spec.md` — byte-identical to source (enforced by test `tests/defaults/spec-prompt-ac.test.ts`).
- **Exec invocation**: `src/engine/exec-claudecode.ts:4` — `runStep` calls `runAgent({ binary: "claude", argv: ["--dangerously-skip-permissions", "-p"], promptDelivery: "argv", ...args })`. The prompt file content is appended as the final CLI argument. No system context or learning-mode framing is injected by the engine code itself.
- **Prompt delivery**: `src/engine/exec-spawn.ts:19–21` — reads the prompt file from `.cycle/<promptPath>`, appends it as last argv element: `spawn("claude", [...argv, prompt], ...)`.

### Existing Patterns to Follow

- **NARRATION_LINE pattern**: `src/engine/sanitize-artifact.ts:1` — alternation of word-boundary-anchored prefixes at line start `^(Now|Next|Here is|Output)\b`. New patterns must use the same `^` anchor and `\b` or equivalent boundary discipline to avoid false positives.
- **While-loop stripping**: `src/engine/sanitize-artifact.ts:7–11` — `while (NARRATION_LINE.test(s))` strips leading narration lines iteratively; blank lines between narration lines are also consumed. New patterns should be added to the same alternation so they benefit from the same loop.
- **Outer-fence unwrap**: `src/engine/sanitize-artifact.ts:12–13` — after narration stripping, if the entire remaining content is wrapped in a single outer fence, the content is extracted. Applied after stripping, not before.
- **Sync-defaults requirement**: `CLAUDE.md` — "After editing `src/defaults/`, run `npm run sync-defaults`." Any change to `src/defaults/prompts/spec.md` must be synced to `.cycle/prompts/spec.md`.
- **Byte-identical dogfood assertion**: `tests/defaults/spec-prompt-ac.test.ts` — the last test `"dogfood spec prompt is byte-identical to default"` compares `src/defaults/prompts/spec.md` vs `.cycle/prompts/spec.md` byte-for-byte. Any unsync'd change breaks this test.
- **Test file for spec prompt**: `tests/defaults/spec-prompt-ac.test.ts` — existing assertions: `## Acceptance Criteria` mandatory prose, observable outcome instruction, checkbox format `- [ ] <observable condition>`, file-artifact framing sentence, insight blocks / star-marker prohibition, dogfood byte-equality. Missing assertions: `confirmation sentences` prohibition (the phrase is in the prompt but untested), `trailing commentary` prohibition (not in the spec prompt at all — the issue mentions it's absent), and no negative example strings.
- **Test file for sanitize**: `tests/engine/sanitize-artifact.test.ts` — 7 tests covering: leading `Now …` stripping, compound narration + fence, idempotency, inner fence preserved, mid-document `Now ` preserved, non-narration prefix preservation (word-boundary), multi-line leading narration + blank lines, empty/whitespace inputs.

### Dependencies & Integration Points

- **`sanitizeArtifactStdout` call site**: `src/engine/run-cycle.ts:307` — applied to all agent-step outputs before `writeFile`. Changes to the function affect every artifact-producing step, not just spec.
- **`SPEC_MIN_BYTES` guard**: `src/engine/run-cycle.ts:311–316` — after sanitization, if `Buffer.byteLength(sanitized) < 200`, `r.status = "failed"`. The contamination pattern in cycles 0217 (`SPEC.md written to…\n\nScope: extend...`) produces ~200+ bytes, so it passes the size gate even though it's structurally invalid.
- **Skip-for-artifact logic**: `src/engine/run-cycle.ts:106–113` — on retry, spec step is skipped if `SPEC.md` exists with `> 0` bytes. A sanitize-stripped but non-empty prior artifact (e.g. the `Scope:` sentence) would allow skip, so the post-retry behavior is not affected by this fix.
- **Dogfood sync script**: `scripts/sync-defaults.mjs` — copies `src/defaults/` → `.cycle/`. Must be run after editing `src/defaults/prompts/spec.md`.
- **Coverage gate**: `scripts/coverage-gate.mjs` — no per-file floor for `src/engine/sanitize-artifact.ts` (it is not in the `FLOORS` table). The global floors apply (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%).

### Test Infrastructure

- **Test framework**: Node `node:test` with `node:assert` (strict). No transpile step — `--experimental-strip-types` via `node ≥ 22.6`.
- **Naming convention**: `tests/<area>/<subject>.test.ts`. Sanitize tests at `tests/engine/sanitize-artifact.test.ts`. Spec prompt tests at `tests/defaults/spec-prompt-ac.test.ts`.
- **Mocking approach for integration tests**: `tests/engine/run-cycle.sanitize.test.ts` and `tests/engine/run-cycle.spec-guard.test.ts` create a temp git repo, write a fake `claude` binary as a shell script that prints specific stdout, then call `runCycle(root, ...)` directly. This is the pattern for testing engine behavior without invoking a real LLM.
- **Unit tests for sanitize**: `tests/engine/sanitize-artifact.test.ts` imports `sanitizeArtifactStdout` directly and tests with string literals. No filesystem or subprocess dependency.
- **Coverage of change area**: `sanitize-artifact.ts` has 7 unit tests. No test currently exercises `SPEC.md written to` or `Single deliverable:` inputs. `spec-prompt-ac.test.ts` has 6 tests; no test for `confirmation sentences` phrase presence.

## Code References

- `src/engine/sanitize-artifact.ts:1` — `NARRATION_LINE` regex: `/^(Now|Next|Here is|Output)\b[^\n]*(?:\n|$)/`
- `src/engine/sanitize-artifact.ts:4–13` — `sanitizeArtifactStdout` implementation
- `src/engine/run-cycle.ts:307` — `sanitizeArtifactStdout(r.stdout)` call
- `src/engine/run-cycle.ts:310–317` — spec size post-condition guard (`SPEC_MIN_BYTES = 200`)
- `src/engine/exec-claudecode.ts:4` — claudecode agent `runStep` — no system context injection
- `src/engine/exec-spawn.ts:19–21` — prompt appended as argv; spawned with `buildChildEnv`
- `src/defaults/prompts/spec.md:130–145` — `## File Artifact Mode` section (approximate lines; section present, no concrete negative example of `SPEC.md written to` pattern)
- `.cycle/prompts/spec.md` — dogfood copy; must be byte-identical after sync
- `tests/engine/sanitize-artifact.test.ts` — 7 unit tests for `sanitizeArtifactStdout`
- `tests/defaults/spec-prompt-ac.test.ts` — 6 tests for spec prompt guardrail language; missing assertion for `confirmation sentences` phrase
- `tests/engine/run-cycle.spec-guard.test.ts` — integration tests for spec size guard; includes one test (`spec-guard [branch]: raw>=200 but sanitized<200 still fails`) that validates sanitization interacts correctly with the size gate
- `docs/ENGINE.md:86` — documents `sanitizeArtifactStdout` behavior: "strips leading `^(Now|Next|Here is|Output)\b …` narration lines"
- `docs/ENGINE.md:134` — known limitation: "prompt text alone is insufficient to prevent contamination when the agent session carries competing learning-mode framing"

## Open Questions

- The observed contamination `SPEC.md written to \`...\`.` starts a line with the literal string `SPEC.md` — should the regex extension target this exact prefix (`^SPEC\.md written to\b`), a broader pattern like `^SPEC\b`, or a general `^[A-Z].*\bwritten to\b` pattern? The broader the pattern, the higher the false-positive risk for legitimate first lines.
- `Single deliverable:` is the second contamination line (after a blank line). Should it be added to `NARRATION_LINE` as an anchored prefix, or is it always preceded by the `SPEC.md written to` line and therefore already eliminated after the first stripping loop iteration removes that line?
- The current `## File Artifact Mode` section in `spec.md` mentions `"Spec written to…"` as a prohibited example. The actual contamination uses `"SPEC.md written to \`path\`."` (capitalized, with backtick path). Should the negative example in the prompt be updated to show the exact observed string to maximize model compliance?
- The `spec-prompt-ac.test.ts` test suite is missing an assertion for the `confirmation sentences` phrase. Is adding that assertion in scope for this cycle, or does it exceed the scoped deliverable?
