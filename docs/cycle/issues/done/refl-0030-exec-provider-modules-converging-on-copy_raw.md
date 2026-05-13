---
id: refl-0030-exec-provider-modules-converging-on-copy
source: reflection
title: exec-provider-modules-converging-on-copy-paste-template
added_at: "2026-05-13T22:05:41.159Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0030"
---

`src/engine/exec-codex.ts` and `src/engine/exec-claudecode.ts` are now ~95% identical: same imports, same `readFile(.cycle/${promptPath})`, same `spawn` shape, same `close`/`error`/stdout/stderr wiring, same `StepResult` resolve. They differ only in (a) the binary name and (b) prompt-delivery channel (argv vs stdin). REVIEW.md noted the cycle 0030 module "follows the `exec-claudecode.ts` template exactly" line-for-line.

Gemini is queued as the next provider. Landing it via the same copy-paste produces a third near-identical module and locks in three places to keep in sync (e.g., any change to env handling, stderr capture, or error semantics). The promptPath contract redesign tracked by `refl-0029-execmodule-promptpath-contract-leaks-on` will need to be applied to all three copies.

Direction: before Gemini lands, extract a shared `runAgent({ binary, argv, promptDelivery: "argv"|"stdin" })` helper in (e.g.) `src/engine/exec-spawn.ts`; reduce each provider module to a thin config object. Coordinate with the promptPath redesign so the contract change happens in one place.
