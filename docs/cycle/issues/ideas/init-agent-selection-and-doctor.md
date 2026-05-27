---
id: init-agent-selection-and-doctor
source: manual
title: "Ask for coding agent during init and verify configured CLIs"
added_at: 2026-05-26T22:16:14Z
priority: idea
---

## Idea

During `npx @cycleai/cli init`, cycle should optionally guide the user through initial agent/runtime setup instead of silently installing workflows that default to Claude Code.

The install flow could ask which coding agent the user wants to use for workflow steps, validate that the corresponding CLI exists, and warn with actionable install/auth guidance when it does not.

## Motivation

Today the default workflows effectively assume `claude` / `claudecode`. Users who have another coding agent configured, such as Codex, may initialize cycle successfully but then hit failures later because workflow steps or triage still implicitly use Claude Code.

The user should be able to choose the agent once during setup rather than manually editing `.cycle/workflows.yml` after init.

## Questions to resolve

- Should `init` be interactive by default, or should interactive setup require a flag such as `--interactive`?
- Should non-interactive init accept flags like `--agent codex` and `--triage-agent codex`?
- Should triage use the same default agent as workflow steps, or be separately configurable?
- Which checks belong in `init` versus a future `cycle doctor` / `cycle preflight` command?
- Should failed CLI checks block init, or just print warnings and remediation steps?

## Possible shape

```sh
npx @cycleai/cli init

? Which coding agent should cycle use by default?
  Claude Code (claude)
  Codex (codex)
  Gemini (gemini)
  Auggie (auggie)
  OpenCode (opencode)
  Pi (pi)

✓ codex found on PATH
⚠ codex authentication not verified; run `codex login` or equivalent before running cycle

? Use the same agent for triage? Yes
```

The selected agent would update both ordinary workflow steps and the triage agent configuration so cycle does not initialize with mixed implicit assumptions.

## Rate-limit and outage recovery

Agent execution should distinguish between transient provider capacity problems and ordinary command failures.

Desired behavior:

- If an agent call fails because the provider is rate limited, unavailable, or experiencing an outage, cycle should retry/resurrect that work once per hour until the provider recovers.
- This applies to practical cases like Claude Code hitting account/provider rate limits or Claude servers being temporarily down.
- The work item should not be marked permanently failed just because the provider was unavailable at that moment.
- For non-rate-limit/non-outage failures, retries should remain bounded.
- Suggested worst-case cap for ordinary retryable failures: `maxRetries: 55`.

Questions to resolve:

- How should cycle classify provider rate limits versus ordinary CLI failures across different agents?
- Should hourly resurrection be a workflow-level default, an agent-level setting, or controlled by failure classification?
- Should `maxRetries: 55` apply globally, per workflow step, or only to non-provider-outage failures?
- Should the UI/status clearly show `waiting_for_rate_limit_reset` or similar instead of generic failure?

## Acceptance criteria draft

- Init can configure the default coding agent without hand-editing `.cycle/workflows.yml`.
- Triage agent selection is explicit and can match the selected workflow agent.
- Init or doctor checks whether the selected CLI is present on `PATH`.
- Missing/unverified CLIs produce clear remediation messages.
- Non-interactive environments can still initialize deterministically.
- Rate-limit/provider-outage failures are classified as transient and retried on an hourly cadence until recovery.
- Ordinary retryable failures remain bounded, with a proposed worst-case `maxRetries: 55`.
