# SPEC — Cycle 0007: Forward `--model` to claudecode and gemini exec modules

## Objective
The `model` step field is plumbed through `run-cycle.ts` into `mod.runStep({ model })`, but the `claudecode` and `gemini` exec modules silently discard it — neither appends a `--model` flag to its subprocess argv. As a result, per-step model selection (and the top-level `defaults.model` resolution that feeds it) is a no-op for the two most-used agents. This cycle makes both modules forward `--model <model>` to their CLIs when a model is set, so that `model:` on a step (or `defaults.model` in `workflows.yml`) actually selects the model end-to-end.

## Source Issue
`feat-agent-model-forwarding` — "Forward --model to claudecode and gemini exec modules"

## Scope

### In Scope
- `src/engine/exec-claudecode.ts`: destructure `model` and append `--model <model>` to argv when set, positioned before the trailing `-p` (consistent with `--append-system-prompt` ordering).
- `src/engine/exec-gemini.ts`: destructure `model` and append `--model <model>` to argv when set.
- Tests asserting `--model` presence-when-set / absence-when-unset for both modules, plus a `claudecode` ordering assertion that `-p` remains the final argv element.

### Out of Scope
- Any `--thinking` forwarding for `claudecode` or `gemini` — neither CLI exposes a thinking flag here; `thinking` stays unforwarded (matching the auggie precedent).
- The `codex`, `auggie`, `opencode`, and `pi` exec modules — they already forward `--model` and are unchanged.
- Changes to `run-cycle.ts`, `exec.ts` dispatch, or the `defaults.{agent,model,thinking}` resolution in `loadConfig` — already landed in cycle 0006.
- Adding a structural invariant for agent-fleet/model-flag consistency.

## Requirements
- When `model` is a non-empty string, `exec-claudecode` argv MUST contain the adjacent pair `"--model", model`; when `model` is undefined/empty, argv MUST NOT contain `--model`.
- For `exec-claudecode`, `-p` MUST remain the final argv element regardless of whether `--model` or `--append-system-prompt` are present (prompt delivery is via argv).
- When `model` is a non-empty string, `exec-gemini` argv MUST contain the adjacent pair `"--model", model`; when `model` is undefined/empty, argv MUST NOT contain `--model`.
- Neither module may emit a `--thinking` flag.
- Existing rate-limit handling (`isRateLimitError` → `rateLimited: true`) and `promptDelivery` mode (`argv` for claudecode, `stdin` for gemini) MUST be preserved unchanged.
- **Failure behavior**: A falsy `model` (undefined, empty string) is treated as "not set" — the module omits `--model` and runs normally rather than emitting an empty/invalid flag. Any `thinking` value passed to either module is silently ignored (no flag emitted, no throw), matching the auggie precedent. If the underlying CLI rejects the supplied model value at runtime, that failure surfaces through the existing `runAgent` result path (non-zero exit captured in the returned result); these modules add no new swallow point. Rate-limit errors continue to be detected and returned as `{ status: "failed", rateLimited: true }`.

## Acceptance Criteria
- [ ] `exec-claudecode` argv contains `--model <value>` when `model` is set, and contains no `--model` token when `model` is unset.
- [ ] `exec-claudecode` argv ends with `-p` in all cases (model set and unset, append-system-prompt present and absent).
- [ ] `exec-gemini` argv contains `--model <value>` when `model` is set, and contains no `--model` token when `model` is unset.
- [ ] Neither `exec-claudecode` nor `exec-gemini` ever emits `--thinking`, even when a `thinking` value is passed.
- [ ] Failure-path: passing `model: ""` (empty string) to either module produces argv with no `--model` flag (treated as unset, no empty-value flag emitted) — asserted by test.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- Node's built-in `node:test` runner with the repo's existing argv-assertion style, mirroring the `codex`/`auggie` exec tests that already cover `--model` presence/absence.
- Inject/capture the argv passed to `runAgent` (per the existing exec-test seam) rather than spawning real binaries.
- Key scenarios:
  - **Happy path**: `model` set → argv includes `["--model", value]`.
  - **Default path**: `model` omitted → argv excludes `--model`.
  - **Failure/edge path**: `model: ""` → argv excludes `--model` (no empty-value flag).
  - **Ordering (claudecode)**: `-p` is the last argv element with and without `--model` and with and without `appendSystemPrompt`.
  - **Thinking ignored**: passing `thinking` emits no `--thinking` for either module.
- No UI changes; no E2E tests required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Update the Architecture "Registered step agents" note so the `claudecode` and `gemini` entries reflect that `model` now maps to `--model` (and that `thinking` is unsupported / ignored for both), removing any implication that they drop `model`.
- **docs/ENGINE.md / `src/engine/exec.ts` doc comments**: Correct any per-agent `--model` support notes that claim or imply the prior (drop-on-the-floor) behavior for `claudecode`/`gemini`.
- **README.md**: No user-facing surface beyond the agent notes above; no README change required.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `src/engine/exec-spawn.ts` `runAgent({ binary, argv, promptDelivery, ... })` — already accepts and forwards `argv`.
- `src/engine/rate-limit.ts` `isRateLimitError` — already imported by both modules.
- The `model` step field and `defaults.model` resolution from cycle 0006 — already plumbed into `mod.runStep({ model })`; no further wiring needed.
- No new external services or environment variables.
