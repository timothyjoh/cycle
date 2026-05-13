---
id: refl-0029-execmodule-promptpath-contract-leaks-on
title: "ExecModule contract: replace `promptPath` with `prompt: string` to stop leaking disk-read convention"
workflow: feature
depends_on: [multi-agent-abstraction-exec-codex, multi-agent-abstraction-exec-gemini]
triaged_at: "2026-05-13T21:48:14.601Z"
source: triage
---
## Problem

`ExecModule.runStep({ repoRoot, promptPath, env })` requires every provider to read a file rooted under `${repoRoot}/.cycle/${promptPath}` (see the join in `src/engine/exec-claudecode.ts`). That shape happens to fit `claudecode` because its CLI contract is "read this path off disk," but it bakes a filesystem-based prompt-handoff convention into the provider interface.

Evidence the abstraction is already leaking:

- `runAgentViaDispatch` in `src/engine/triage.ts:702-719` synthesises a triage prompt as a string in memory, then is forced to write it to `.cycle/.triage-<hex>.prompt.md` and unlink in `finally` purely to satisfy the `promptPath` shape.
- A future `codex` or `gemini` provider with a different prompt-handoff convention (stdin pipe, JSON request body, in-memory buffer) will either need a special-case in triage to keep writing temp files, or every provider will be forced to keep doing a `readFile` of a path it didn't ask for.

The whole point of cycle 0029 was a clean seam for swapping providers. Passing a filesystem path through that seam is the existing provider's mechanism leaking into the contract.

## Direction

Change `ExecModule.runStep`'s prompt input from `promptPath: string` to `prompt: string` (or `prompt: { body: string; sourcePath?: string }` if a provider genuinely needs the path for diagnostics). Callers already have the prompt as a string immediately before the spawn — workflow steps read the prompt template themselves; triage already synthesises it in memory.

Candidate shape:

```ts
interface ExecModule {
  runStep(args: {
    repoRoot: string;
    prompt: string;
    env: Record<string, string>;
  }): Promise<ExecResult>;
}
```

Migration sketch:

1. Push the existing `readFile(.cycle/${promptPath})` call from each provider down into the workflow-step caller (one site, in `runStep` orchestration), and out of triage's `runAgentViaDispatch` (which already has the string).
2. Update `exec-claudecode.ts` to accept the string and pipe it however that CLI prefers (stdin, `--prompt @-`, or whatever the current contract permits).
3. Delete the temp-file scaffolding in `triage.ts:702-719` (the `.triage-<hex>.prompt.md` write + `finally` unlink).
4. Re-run the full suite plus any provider-specific integration coverage that was implicitly relying on the disk-read path.

## Why now

Deferred until the second provider lands so the right shape is empirically clear, but flag the leak now so the next provider cycle re-examines it instead of cargo-culting `promptPath`. This work is `depends_on` the codex/gemini provider modules so we have at least one non-claudecode caller to validate the new shape against before changing the interface.

## Out of scope

- Adding a third prompt-handoff convention (e.g. structured tool-call request bodies). This issue is about removing the filesystem leak, not generalising further.
- Refactoring `repoRoot` / `env` plumbing.

## Acceptance

- `ExecModule.runStep` no longer accepts a `promptPath`; it accepts a string prompt body.
- `claudecode`, `codex`, and `gemini` provider modules implement the new shape.
- Triage no longer writes `.cycle/.triage-*.prompt.md` temp files; the `runAgentViaDispatch` finally-unlink is gone.
- Workflow step orchestration (single site) is the only place that reads a prompt template off disk; providers receive a ready string.
- Tests + typecheck + coverage gates pass.
