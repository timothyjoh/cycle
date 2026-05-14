```markdown
# SPEC — Cycle 0053: Strip Prompt Self-Narration and Stray Fences from Workflow Step Artifacts

## Objective

Workflow step artifacts (`docs/cycle/<id>/<step>.md`) currently leak prompt-internal narration like `Now sync defaults…` and stray top-level ``` fences out of agent stdout into committed files. Downstream prompts (triage, reflection, future agents) read these artifacts as context and risk modelling the leading `Now …` line as an instruction aimed at them. This cycle defends in the engine — once, at the stdout-write seam — by sanitizing captured stdout before it lands on disk, so every current leak and every future regression is caught in one place without touching individual prompt templates.

## Source Issue

`refl-0023-build-and-fix-md-artifacts-leak-agent-se` — "Strip prompt self-narration and stray fences from workflow step artifacts"

## Scope

### In Scope

- Add `sanitizeArtifactStdout(stdout: string): string` helper at `src/engine/sanitize-artifact.ts` implementing the four-step pipeline: trim leading whitespace → drop leading narration lines matching `^(Now|Next|Here is|Output)\b.*$` (one or more, blank lines between OK) → unwrap a single top-level ``` fence if it covers the entire remaining payload → trim trailing whitespace + ensure exactly one trailing newline.
- Wire `sanitizeArtifactStdout` into the engine seam in `src/engine/run-cycle.ts` (or the upstream `exec-claudecode` capture layer, whichever owns the stdout→`<step>.md` write) so every `docs/cycle/<id>/<step>.md` artifact is sanitized before being written. `log.jsonl` payloads MUST remain untouched.
- Unit tests at `tests/engine/sanitize-artifact.test.ts` covering: BUILD-shaped leading `Now …` strip; REVIEW-shaped strip + fence-unwrap (golden from a recent real cycle); clean FIX-shaped idempotence (`f(f(x)) === f(x)`); inner fence preservation (fence inside a larger document is NOT unwrapped); mid-document `Now ` line preservation; non-narration leading capitalised words (`Note:`, `Notice:`) preserved. Plus one integration assertion in an existing `runCycle` test that a committed `<step>.md` whose captured stdout begins with `Now …` no longer starts with that line.

### Out of Scope

- Editing `src/defaults/prompts/{build,fix,review}.md` to tighten output discipline at the source. The engine-side filter is the durable defense and must land first; prompt tightening is a separate future cycle.
- Retroactively rewriting committed `BUILD.md` / `REVIEW.md` files from prior cycles. Forward-looking only.
- Generalised prompt-output linting beyond the two narration-prefix and outer-fence patterns named in the issue.
- Sanitising stdout for non-artifact-producing steps (`commit`, `verify`, `pr`, `cycle.checkout`, etc.) — those are already either bash scripts or do not write `<step>.md`.

## Requirements

- `sanitizeArtifactStdout` is a pure function: `(stdout: string) => string`, no I/O, no dependencies on `node:fs` / `node:path`, deterministic, importable in isolation.
- The narration regex matches `^(Now|Next|Here is|Output)\b.*$` case-sensitively at the start of a line. Word boundary required so `Notification` / `Outputs` / `Nowadays` do NOT match.
- Multi-line leading narration is stripped: consecutive matching lines (with optional blank lines between) at the very top of the payload are all dropped before fence-unwrap considers what remains.
- Top-level fence unwrap is conservative: the pattern `^```(\w+)?\n[\s\S]*\n```\s*$` must cover the entire remaining payload (after narration strip + leading-whitespace trim). If any non-whitespace content sits outside the fence at the top level, the payload is left intact. Only one unwrap pass; nested fences inside the unwrapped body are untouched.
- Output is `\n`-terminated exactly once. Idempotent: `f(f(x)) === f(x)` for any input.
- Empty / whitespace-only input returns `""` (no trailing newline added to an empty payload — avoids spurious newline-only artifacts).
- Engine wiring: sanitization happens at the single point where captured stdout becomes the `<step>.md` write payload. `appendLog` / `log.jsonl` events MUST receive unsanitized stdout (or no stdout at all, matching current behavior). Verifiable by an integration test that asserts the artifact differs from the log payload in a controlled scenario.
- No new runtime dependencies. Pure TypeScript / standard library.

## Acceptance Criteria

- [ ] `src/engine/sanitize-artifact.ts` exists, exports `sanitizeArtifactStdout(stdout: string): string`.
- [ ] `tests/engine/sanitize-artifact.test.ts` covers all six unit-test scenarios listed under In Scope and passes.
- [ ] One existing `runCycle`-level integration test asserts a committed `<step>.md` whose stdout begins with `Now …` does NOT start with that line on disk.
- [ ] `log.jsonl` payloads for the same scenario are unchanged (asserted via the integration test OR via a unit-level wiring test, whichever the build chooses).
- [ ] `npm run typecheck` clean — no warnings, no errors.
- [ ] `npm test` passes 100%.
- [ ] `npm run test:coverage` shows no regression vs master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%); per-file coverage on the new helper at parity-or-above the global floor.
- [ ] `scripts/coverage-gate.mjs` (per-file `triage.ts ≥ 95%`) still passes — no incidental regression in unrelated files.

## Testing Strategy

- Framework: Node's native `node:test` (matches existing `tests/**/*.test.ts` convention; runs under `--experimental-strip-types`).
- Unit tests in `tests/engine/sanitize-artifact.test.ts` exercise the pure function directly with focused string inputs (no mocks needed). Use real captured stdout from a recent cycle's REVIEW.md as the golden for the strip-plus-unwrap case.
- Edge cases:
  - Happy path: `Now sync defaults…\n\n# BUILD\n…` → leading line gone.
  - Compound: leading narration line + body wrapped in ``` fence → both stripped.
  - Idempotence: feeding a clean payload back through returns identical bytes.
  - Negative — inner fence: a payload with prose before and after a fenced code block has the fence preserved (only outer fences spanning the whole payload are unwrapped).
  - Negative — non-narration prefix: leading `Note: …` / `Notice: …` / `Nowadays …` lines preserved verbatim.
  - Negative — mid-document `Now ` line: appears 10 lines into the body, must survive.
  - Empty / whitespace-only input → `""`.
- Integration: extend an existing `tests/engine/run-cycle*.test.ts` (or equivalent) — fixture an agent stdout starting with `Now …`, run through the artifact-write path, assert the on-disk `<step>.md` doesn't begin with `Now `. No new E2E required; this is an internal pipeline change with no user-visible UI.
- No Playwright / browser tests — change is CLI/engine only.

## Documentation Updates

- **CLAUDE.md**: add a one-line bullet under `## Architecture quick reference` noting that captured agent stdout is sanitized (`sanitizeArtifactStdout`) before being written to `docs/cycle/<id>/<step>.md`; `log.jsonl` payloads are untouched. Cross-reference the helper path.
- **README.md**: no surface-visible change for consumers; skip unless the change manifests in user-observable artifact shape on a fresh dogfood run (in which case mention briefly in the "What `cycle` writes" section if one exists).
- The `documentation` workflow step (added in cycle 0052) will sweep any drift after `pr`/`commit-trunk` lands, but the explicit CLAUDE.md update is part of "done" for this cycle.

## Dependencies

- Existing engine plumbing in `src/engine/run-cycle.ts` and the `exec-*.ts` capture layer — the seam where captured stdout becomes the `<step>.md` write must already be a single chokepoint; if it isn't, the build step's first task is to identify (or create) the single chokepoint.
- Node ≥ 22.6 with `--experimental-strip-types` (already required by the repo).
- No external services, no env vars, no new dependencies.
```
