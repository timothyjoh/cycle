---
id: track-log-and-tbd-as-committed-state-of-record
title: "Engine: track .cycle/log.jsonl + .cycle/tbd.jsonl in git as state-of-record (un-ignore + commit each cycle)"
source: text
priority: high
triage_attempts: 0
---

`.cycle/log.jsonl` (the append-only run/event log) and `.cycle/tbd.jsonl` (the queue) are currently **gitignored**, so they don't travel with the repository. A fresh clone therefore starts with an **empty log and empty queue**, which is wrong: the run history and queue are the engine's state-of-record and should always accompany the repo. This also causes a concrete bug — on a re-clone the engine's cycle-id counter restarts from the low end (the log it derives the next id from is empty), producing colliding cycle directories (see `fix-next-cycle-id-derivation-survive-log-reset`; tracking the log fixes this at the root).

**Decision (explicit):** the log and tbd files should be committed and travel with the repo. The log is append-only (`src/engine/log.ts` uses `appendFile`), so per-cycle diffs are just appended lines — never rewound or truncated.

## What to change
1. **Un-ignore both files.** Remove `.cycle/log.jsonl` and `.cycle/tbd.jsonl` from the ignore rules — both in the shipped defaults (`src/defaults/.gitignore` or wherever the engine writes the per-repo ignore) **and** this repo's own ignore. Run `npm run sync-defaults` after editing defaults. (Leave genuinely-ephemeral runtime files — `.cycle/engine.lock`, `.cycle/run.log`, `.cycle/failed-residue-context.json`, `.cycle/.env`, generated `--settings` files — still ignored; this change is **only** log.jsonl + tbd.jsonl.)
2. **Commit them as part of each cycle.** `commitCycle` (`src/engine/commit-cycle.ts`) must stage `.cycle/log.jsonl` and `.cycle/tbd.jsonl` alongside the cycle's other changes, so the committed history advances every cycle. Without this they'd become tracked-but-perpetually-dirty (the residue guard already excludes `.cycle/**`, so they won't trip it — but they'd never actually get committed, defeating the purpose).
3. **`cycle upgrade` contract.** The CLAUDE.md upgrade note says upgrade "NEVER touches state (`.cycle/.env`, `.cycle/tbd.jsonl`, `.cycle/log.jsonl` …)" — that still holds (upgrade must not overwrite their *contents*); this change is about whether git *tracks* them, which is orthogonal. Confirm upgrade still leaves their contents alone.

## Notes / trade-offs
- The log grows unbounded in git history (append-only). Accepted: it is the state-of-record. A future optional compaction/rotation policy can be considered separately — **do not** add truncation here (we never truncate the log).
- Trunk mode is single-writer, so committing these per cycle won't create cross-writer merge conflicts in normal operation.

## Acceptance
- `.cycle/log.jsonl` and `.cycle/tbd.jsonl` are tracked in git (not ignored), in both the defaults and this repo; `sync-defaults` reflects it.
- After a cycle completes, the commit includes the updated `log.jsonl` + `tbd.jsonl` (verify: `git show --stat HEAD` lists them).
- A fresh clone has the full log + queue (cycle-id continues monotonically; no restart/collision).
- `engine.lock` / `run.log` / `.env` / residue-context remain ignored. Coverage added per the repo's floors (commit-cycle.ts is a floored file).
