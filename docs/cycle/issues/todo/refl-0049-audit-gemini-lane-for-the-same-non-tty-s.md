---
id: refl-0049-audit-gemini-lane-for-the-same-non-tty-s
title: Audit non-claudecode lanes for the non-TTY stdin hazard that broke codex
workflow: feature
depends_on: []
triaged_at: 2026-06-03T22:36:21.007Z
source: triage
priority: medium
---
## Background

Cycle 0049 pinned the codex lane to `codex exec` because bare `codex` rejects a piped (non-TTY) stdin with `Error: stdin is not a terminal` on codex-cli >= 0.136. SPEC Out-of-Scope and BUILD.md "Deferred work" both acknowledged that the `gemini`, `auggie`, `opencode`, and `pi` lanes were never audited for the same interactive-vs-subcommand hazard, but no follow-up issue was filed. This is that follow-up.

## The concern

The hazard is **not speculative for gemini**: per CLAUDE.md the `gemini` lane delivers its prompt **over stdin** — exactly the delivery mechanism that triggered the codex breakage. If a future gemini-cli version gates interactive mode on a TTY the way codex-cli >= 0.136 now does, the gemini lane would fail identically — and, per the codex pattern, the failure would surface three cycles later on someone else's machine, not here. The `auggie` lane (`--print --instruction-file <path>`) and the `opencode`/`pi` lanes (argv-delivered prompts) are lower-risk because they do not pipe the prompt over stdin, but each deserves a one-line confirmation that its delivery path does not depend on an interactive TTY.

## Scope

A focused **audit** cycle. For each non-claudecode agent lane (`gemini`, `auggie`, `opencode`, `pi` — see the `exec-*.ts` files and the REGISTRY in `exec.ts`):

1. Identify how the prompt is delivered (stdin vs argv vs instruction file) by reading the lane's exec code.
2. Check the upstream CLI's interactive-mode gating — does it require/assume a TTY on the delivery path the lane uses? Read the upstream CLI docs/help for a non-interactive / print / exec equivalent.
3. **Prioritize the `gemini` stdin path** — it is the one that most closely mirrors the codex breakage.

## Deliverable

- If a real hazard is confirmed for a lane: add the `--print`/subcommand/non-interactive equivalent to that lane (mirroring the `codex exec` fix and its `CYCLE_<AGENT>_BIN` + structural-invariant pattern where applicable), plus tests.
- If no hazard is confirmed: this may be a **doc-only** outcome — record the per-lane audit findings (delivery mechanism + non-TTY safety confirmation) in the relevant doc (e.g. `docs/models.md` or `docs/ENGINE.md`) and set `expects_code: false` if no code change is warranted, so the empty-diff guard is satisfied by the doc deliverable.

**Do not** add a fix to a lane where no real non-TTY hazard exists — confirm against the upstream CLI's actual interactive-mode gating before changing any lane. No speculative changes.
