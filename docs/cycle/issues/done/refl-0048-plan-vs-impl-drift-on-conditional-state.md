---
id: refl-0048-plan-vs-impl-drift-on-conditional-state
title: Resolve PLAN-vs-impl drift on sync-state write condition (guard write OR document unconditional write)
workflow: feature
depends_on: []
triaged_at: "2026-05-14T17:24:23.929Z"
source: triage
---
## Context

Cycle 0048 PLAN.md L43 specified: *"If anything was copied, atomic-write the updated state map."* The shipped implementation in `scripts/sync-defaults.mjs:123` writes `.cycle/.sync-state.json` **unconditionally** on every run — including an all-divergent first run where the destination lands as `{}\n`. REVIEW.md flagged this as benign drift; SPEC does not forbid either shape, so neither is wrong, but PLAN and impl disagree.

## Why it matters

Low severity — but plan-vs-impl drift in a freshly written file is the cheapest kind to reconcile at write-time. Symptom for an operator: running `npm run sync-defaults` in a fresh checkout against an all-divergent `.cycle/` produces a surprise `{}` state file in `git status` / `ls .cycle/` even though nothing was copied.

## Acceptance

Pick exactly one of the following and land it; the other becomes a no-op:

1. **Guard the write (matches PLAN):** wrap the `writeFileSync` of `.cycle/.sync-state.json` in `scripts/sync-defaults.mjs` behind a `copied.length > 0` check (or equivalent — "any entry changed"). Add a regression test in `tests/sync-defaults*.test.*` (or wherever divergence-guard coverage already lives) that runs `sync-defaults` against a 100%-divergent destination set and asserts:
   - exit code `2`
   - stderr divergence summary present
   - `.cycle/.sync-state.json` **does not exist** (or, if pre-existing, is unchanged byte-for-byte).

   **OR**

2. **Document the unconditional write (matches impl):** update `CLAUDE.md > ### \`sync-defaults\` divergence guard` to explicitly note that `.cycle/.sync-state.json` is (re)written on every successful invocation, including all-skip runs, and that an empty `{}` body is the expected first-run shape when every destination is locally divergent. Cross-reference `RFC-001` if/where state-file shape is otherwise documented.

## Suggested direction

The doc fix (option 2) is strictly cheaper and lower-risk — no code change, no new test, no behavior change for downstream consumers. Pick it unless the guard option turns up an actual operator pain point during build.

## Out of scope

- Schema changes to `.sync-state.json` beyond presence/absence of the file.
- Any change to the divergence detection logic itself (`src_sha256` / `dst_sha256` comparison) — that's the load-bearing part of cycle 0048 and must not regress.
- Force-overwrite path (`--force` / `CYCLE_SYNC_DEFAULTS_FORCE=1`) — already tested.
