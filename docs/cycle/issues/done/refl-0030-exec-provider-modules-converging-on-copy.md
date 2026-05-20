---
id: refl-0030-exec-provider-modules-converging-on-copy
title: Extract shared runAgent helper before Gemini lands to stop exec-provider copy-paste
workflow: feature
depends_on: []
triaged_at: "2026-05-13T22:07:46.354Z"
source: triage
---
## Problem

`src/engine/exec-codex.ts` and `src/engine/exec-claudecode.ts` are now ~95% identical: same imports, same `readFile('.cycle/' + promptPath)`, same `spawn` shape, same `close`/`error`/stdout/stderr wiring, same `StepResult` resolve. They differ only in (a) the binary name and (b) prompt-delivery channel (argv vs stdin). The cycle 0030 REVIEW.md noted exec-codex "follows the exec-claudecode.ts template exactly" line-for-line.

Gemini (`multi-agent-abstraction-exec-gemini`) is the next provider in the queue. Landing it via the same copy-paste produces a third near-identical module and locks in three places to keep in sync (env handling, stderr capture, error semantics, ENOENT race guards). The promptPath contract redesign tracked by `refl-0029-execmodule-promptpath-contract-leaks-on` would then need three copies to edit instead of one.

## Direction

Before Gemini lands, extract a shared `runAgent({ binary, argv, promptDelivery: "argv"|"stdin", promptPath, repoRoot, signal? })` helper in `src/engine/exec-spawn.ts`. Reduce each existing provider module (`exec-codex.ts`, `exec-claudecode.ts`) to a thin config object that delegates to the helper. Preserve current observable behavior exactly:

- prompt resolution: still `readFile(join(repoRoot, '.cycle', promptPath))`
- spawn discipline: array args, no `shell: true`, curated PATH via `child-env.ts`
- stdin path: write prompt, end stream; keep the ENOENT-stdin race guard (error listener on `stdin` + try/catch around write)
- argv path: pass prompt as final positional arg
- stdout/stderr capture: head-cap on stderr, full stdout buffer
- exit semantics: `StepResult { status: 'ok' | 'failed', stdout, stderr_excerpt?, error? }`

## Scope

- Add `src/engine/exec-spawn.ts` (new module: the shared `runAgent` helper)
- Shrink `src/engine/exec-codex.ts` and `src/engine/exec-claudecode.ts` to config + delegation
- Update `src/engine/exec.ts` registry imports if module shape changes; do NOT change the registry contract or `ExecModule` interface in this cycle
- Tests: keep `tests/engine/exec-codex.test.ts` and `tests/engine/exec-claudecode.test.ts` green against the new internal shape; add `tests/engine/exec-spawn.test.ts` covering the two delivery modes, ENOENT, non-zero exit + stderr capture
- Coverage must not drop vs baseline (line ≥ 95%, branch ≥ 75%, func ≥ 90%)

## Out of scope

- Gemini provider module itself (`multi-agent-abstraction-exec-gemini`) — that consumes this helper in its own cycle
- `ExecModule` `promptPath` → `prompt: string` contract redesign (`refl-0029-execmodule-promptpath-contract-leaks-on`) — runs after Gemini lands per its existing deps; coordinate at that point so the contract change happens in the helper, not in three duplicated providers
- The dead-code stdin try/catch (`refl-0030-exec-codex-defensive-stdin-catch-is-dead-code`) — resolve there once the helper centralizes the write path

## Acceptance

- `src/engine/exec-spawn.ts` exists and exports `runAgent` with the documented shape
- `exec-codex.ts` and `exec-claudecode.ts` each fit on a screen and contain only config + a single `runAgent(...)` call
- All existing exec-* tests pass without behavioral change
- `npm test`, `npm run typecheck`, `npm run test:coverage` green; coverage baselines held
- BUILD.md / FIX.md report line/branch/func numbers

## Why now

Lands before Gemini queue row pops. After Gemini, the refactor still works but pays the cost of a third synced copy first.
