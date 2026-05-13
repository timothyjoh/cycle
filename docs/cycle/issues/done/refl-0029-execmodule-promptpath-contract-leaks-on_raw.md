---
id: refl-0029-execmodule-promptpath-contract-leaks-on
source: reflection
title: execmodule-promptpath-contract-leaks-on-disk-convention
added_at: "2026-05-13T21:45:56.624Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0029"
---

`ExecModule.runStep({ repoRoot, promptPath, env })` requires every provider to read a file rooted under `${repoRoot}/.cycle/${promptPath}` (see `src/engine/exec-claudecode.ts` join). To reuse the dispatch path for triage's synthesized prompt, `runAgentViaDispatch` in `src/engine/triage.ts:702-719` writes a temp file `.cycle/.triage-<hex>.prompt.md` and unlinks in `finally`. That works for `claudecode` only because the `claudecode` module's contract happens to be "read this path off disk." A future `codex` or `gemini` provider with a different prompt-handoff convention (stdin pipe, API body, in-memory) will either need its own special-case in triage or force every provider to keep the same disk-read shape.

Why it matters: the whole point of cycle 0029 was a clean seam for swapping providers. The current seam still passes a filesystem path through the interface, so the abstraction leaks the existing provider's mechanism into the contract. Triage's synthetic-prompt scaffolding is a hint that the API wants a string-body input, not a path.

Direction: consider changing `runStep`'s input from `promptPath` to `prompt: string` (already a string everywhere in the codebase right before the spawn). The `claudecode` module would do the `readFile` internally only at module boundary, or callers would read the file. Defer until a second provider lands so the right shape is empirically clear, but flag the leak now so the next provider cycle re-examines it instead of cargo-culting `promptPath`.
