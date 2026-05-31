---
id: feat-compress-step-output
title: "Optional command-output compression for claudecode steps (token savings)"
workflow: feature
depends_on: []
triaged_at: "2026-05-31T01:50:00.000Z"
source: user
priority: low
---
## Problem

Verbose command output (git/ls/grep/diff/cat) consumed by an agent step eats
context-window tokens with low information density. a5c-ai/babysitter rewrites
such commands through a `compress-output` filter via a `PreToolUse` hook and
claims 50–67% token reduction on those outputs.

cycle has no equivalent. For long-running autonomous cycles this is real cost.

## Task

Add an **opt-in** output-compression path for `claudecode` steps:

- A `PreToolUse` hook (registered via the claude CLI `--settings`/hook config
  for the claude lane only) that detects simple, compressible read commands
  (`git`, `ls`, `grep`, `rg`, `diff`, `cat`, `head`, `tail`, …) with no shell
  operators and rewrites them to run through a `cycle compress-output <cmd>`
  filter that density-filters the output before it enters the model's context.
- A new `cycle compress-output` subcommand implementing the filter (configurable
  keep-ratio / threshold; passthrough below threshold).
- Gate behind a config flag (`engine.compress_output`, default **off**) — this
  is an optimization, not a behavior change, and must be trivially disableable.
- claudecode-only (it relies on Claude Code's hook mechanism); other fleet
  agents are unaffected. Document this clearly.

## Acceptance criteria

- [ ] `cycle compress-output <cmd>` subcommand: runs the command, density-filters stdout, passes through below threshold; exit code preserved.
- [ ] Opt-in `engine.compress_output` flag wires the `PreToolUse` rewrite for the claude lane; default off → zero behavior change.
- [ ] Compression is lossless-enough: error lines / non-zero exits are never dropped (no-silent-failure).
- [ ] Tests cover the filter (compressible vs passthrough, exit-code preservation, error-line retention) and the off-by-default path.
- [ ] `npm run typecheck` clean; `npm test` passes; coverage holds.

## Notes

- Source: babysitter gap-analysis (2026-05-30/31). Lower priority than the
  completion-proof and too-fast guards — pure optimization.
- This is also a concrete first use of the `PreToolUse`-hook plumbing that
  RFC-005 (runtime-enforced step contracts) would build on for the claude lane.
