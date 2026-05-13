# SPEC — Cycle 0029: Engine exec-module interface + agent dispatch table

## Objective

Introduce a single `ExecModule` interface and an in-engine dispatch table so the per-step `agent:` field in `workflows.yml` resolves to a concrete implementation through one well-defined seam. The existing `claudecode` path keeps its behavior bit-for-bit; future provider modules (`codex`, `gemini`, …) plug in by registering against the table. Without this seam, every new provider would require scattering conditionals through `run-cycle.ts`, `triage.ts`, and any future caller.

## Source Issue

`multi-agent-abstraction-exec-interface` — "Engine: exec-module interface + agent dispatch table"

## Scope

### In Scope

- Define `ExecModule` interface and `UnknownAgentError` in `src/engine/exec.ts`; export a dispatch table + `resolveAgent(name)` lookup with `claudecode` as the sole registered entry.
- Refactor `src/engine/exec-claudecode.ts` to conform to `ExecModule` (no behavior change for the existing `claude -p <prompt>` spawn) and register it from `exec.ts`.
- Route every current direct call to `execClaudecodeStep` and every inline `spawn("claude", …)` for an `agent:`-driven step through `resolveAgent(...)` instead — covers `src/engine/run-cycle.ts` (workflow step dispatch) and `src/engine/triage.ts` (both `cfg.triage.agent !== "claudecode"` guards plus the inline `spawn("claude", …)` triage exec).

### Out of Scope

- New provider modules (`exec-codex`, `exec-gemini`, …). They are separate sibling cycles of the parent raw.
- Changes to `workflows.yml` schema. The `agent:` field already exists; this cycle does not add `tools`, `model`, or any new per-step config.
- Widening `Step.agent`'s static type in `src/engine/workflow.ts` beyond what dispatch routing requires (it stays `string`-typed for non-bash agents; the dispatch is the authoritative validator at runtime).
- Reflection ingestion: `src/engine/reflection.ts` does not spawn agents itself — it parses stdout from a step the run-cycle loop already dispatched — so it requires no call-site change in this cycle.
- Any provider-specific tooling, env-var protocols, or rate-limit handling beyond what the existing `claudecode` path already does.

## Requirements

- `src/engine/exec.ts` exports:
  - `ExecModule` — a type/interface with one method: `runStep({ repoRoot, promptPath, env }) -> Promise<StepResult>` (mirrors the existing `execClaudecodeStep` signature; `StepResult` continues to come from `exec-bash.ts`).
  - `UnknownAgentError` — a named `Error` subclass whose message includes the unknown name and the alphabetized list of known names (e.g. `agent "foo" is not registered; known agents: claudecode`).
  - `resolveAgent(name: string): ExecModule` — looks up the dispatch table; throws `UnknownAgentError` on miss.
  - Internal registry: `Record<string, ExecModule>` populated at module load. Adding an agent is a one-line registration.
- `src/engine/exec-claudecode.ts` exports an `ExecModule` (no compatibility shim or legacy `execClaudecodeStep` re-export — callers move to `resolveAgent("claudecode").runStep(...)`).
- `src/engine/run-cycle.ts` step dispatch:
  - `agent: "bash"` keeps its existing `execBashStep` path.
  - All other agents go through `resolveAgent(step.agent).runStep(...)`. The unknown-agent error surfaces as a normal step failure: the runner catches `UnknownAgentError`, emits `step.end status:failed` with the error message in the event payload (same shape as other step failures), and lets the existing failure-handling path proceed (no bypass into "halt the engine" semantics).
- `src/engine/triage.ts`:
  - Both `cfg.triage.agent !== "claudecode"` guards are removed.
  - The inline `spawn("claude", ["-p", prompt], …)` for triage is replaced with `resolveAgent(cfg.triage.agent).runStep(...)`.
  - Unknown triage agent surfaces as a triage-pass failure via the existing `engine.paused {reason: "all_triage_failed", …}` path, with the `UnknownAgentError` message captured in `last_errors[].error` (subject to the existing 2000-char cap).
- No silent fallback to `claudecode` anywhere.
- Subprocess discipline preserved: the registered `claudecode` module still uses `spawn` with array args, `shell: false`, and `buildChildEnv`.

## Acceptance Criteria

- [ ] `src/engine/exec.ts` exists and exports `ExecModule`, `UnknownAgentError`, `resolveAgent`.
- [ ] `src/engine/exec-claudecode.ts` exports an `ExecModule` and is registered in the dispatch table at module load; no `execClaudecodeStep` symbol remains.
- [ ] `src/engine/run-cycle.ts` and `src/engine/triage.ts` route all `claudecode`-bound spawns through `resolveAgent(...)`; no direct `spawn("claude", …)` or `import …/exec-claudecode` remains outside `exec.ts` / `exec-claudecode.ts` / their tests.
- [ ] New unit test: `resolveAgent("claudecode")` returns the registered module (verifies the module shape — e.g. `typeof .runStep === "function"`).
- [ ] New unit test: `resolveAgent("foo")` throws `UnknownAgentError`; the thrown error is an `instanceof UnknownAgentError`; its message contains the literal string `"foo"` and the literal string `"claudecode"` (so the known-agents list is asserted).
- [ ] New unit test: `run-cycle.ts` step dispatch with an unregistered agent emits `step.end status:failed` carrying the `UnknownAgentError` message (uses the existing log-capture pattern from `tests/engine/run-cycle.test.ts`).
- [ ] New unit test: `triage.ts` with `cfg.triage.agent = "foo"` produces `engine.paused` with `reason: "all_triage_failed"` and `last_errors[].error` containing `"foo"` and `"claudecode"`.
- [ ] Existing `tests/engine/exec-claudecode.test.ts` still passes against the refactored module (updated to call through `resolveAgent("claudecode")` or directly against the exported `ExecModule`; PATH-stubbed fake `claude` binary unchanged).
- [ ] `npm test` passes. No new TypeScript or linter warnings.
- [ ] Coverage holds: line ≥ 95%, branch ≥ 75%, function ≥ 90% (no per-file regression in `src/engine/`).
- [ ] After editing `src/defaults/` is **not** required this cycle (no default workflow YAML or prompt changes). `npm run sync-defaults` is unaffected.

## Testing Strategy

- Framework: Node's native test runner (`node:test`) via `npm test`, mirroring the rest of `tests/engine/`.
- New file: `tests/engine/exec.test.ts` covering the dispatch + error path (the two unit tests above for `resolveAgent`).
- Extend `tests/engine/run-cycle.test.ts` with one case asserting the unknown-agent failure surfaces as a normal `step.end status:failed` event (using the existing in-memory log capture pattern).
- Extend `tests/engine/triage.test.ts` with one case asserting an unknown triage agent produces `engine.paused {reason: "all_triage_failed"}` with the `UnknownAgentError` message threaded through `last_errors[].error`.
- Refactor `tests/engine/exec-claudecode.test.ts` to call through the new module surface, keeping the existing fake-`claude`-on-PATH integration as-is — this is the regression net that proves no behavior change for the happy path.
- No E2E tests required: no UI change, no user-visible CLI surface change. The change is internal refactor + new error type behind the existing `agent:` field.

## Documentation Updates

- **CLAUDE.md**: update the "Architecture quick reference" engine-source bullet to list `exec` alongside `exec-bash` / `exec-claudecode`, and add a one-line note that the per-step `agent:` field is resolved through `resolveAgent` with `UnknownAgentError` on miss.
- **README.md**: no user-facing CLI or workflow change. No update required this cycle.
- **`docs/RFC-001-issue-lifecycle.md`**: unaffected (lifecycle semantics unchanged).
- **`BRIEF.md`**: unaffected (already says "Agents per step (`claudecode`, `codex`, `bash`) are configurable" — no edit needed; the new error type is an implementation detail).

Documentation is part of "done" — code without updated `CLAUDE.md` is incomplete.

## Dependencies

- Existing `buildChildEnv` from `src/engine/child-env.ts`, `StepResult` from `src/engine/exec-bash.ts`, and the curated-PATH subprocess discipline.
- No new runtime dependencies. No new env vars. No new external services. `claude` CLI requirement is unchanged.
- No coupling to in-flight cycles or paused engines beyond what the existing triage / step-failure machinery already handles.
