---
id: redesign-02-load-cycle-env
title: Load .cycle/.env at engine bootstrap so CYCLE_TRUNK_BASED is honored as documented
workflow: feature
depends_on: [redesign-01-single-engine-lock]
triaged_at: "2026-05-21T03:07:47.096Z"
source: triage
---
## Problem

CLAUDE.md documents that trunk-based operation is enforced via `CYCLE_TRUNK_BASED=1` in `.cycle/.env`. No engine code reads `.cycle/.env`. The variable only takes effect if already exported in the shell or passed via `--trunk`. The shipped default is `commit.mode: worktree-pr`, so repos relying solely on `.cycle/.env` silently run in worktree-pr mode — creating branches and worktrees instead of committing to trunk.

Key sites:
- `src/cli.ts:125` — `--trunk` sets `process.env.CYCLE_TRUNK_BASED = '1'`
- `src/engine/workflow.ts:86` — only reader of `CYCLE_TRUNK_BASED`
- `src/defaults/workflows.yml:7` — ships `commit.mode: worktree-pr`
- No code path reads `.cycle/.env`

## Approach

Add a hand-rolled `.cycle/.env` loader that fires at engine bootstrap, before `loadConfig()`. Rules:

1. Parse `KEY=VALUE` lines; skip blank lines and lines starting with `#`.
2. Set `process.env[key] = value` only when `process.env[key]` is `undefined` (real env wins; `--trunk` still wins because it sets the var before bootstrap).
3. If `.cycle/.env` does not exist, silently no-op.
4. Tolerate malformed lines (no `=`) — skip them.
5. No external dependency; no `shell: true`.

Out of scope: changing the shipped default. Keep `worktree-pr` as the YAML default and let `.cycle/.env` / `--trunk` override it.

## Implementation Plan

### New module: `src/engine/dot-env.ts`

Export a single function:

```typescript
export function loadDotEnv(filePath: string): void
```

- Read file synchronously with `fs.readFileSync`; catch `ENOENT` and return immediately.
- Split on newlines; for each line:
  - Trim. Skip if empty or starts with `#`.
  - Find first `=`; if absent, skip.
  - `key = line.slice(0, idx).trim()`, `value = line.slice(idx + 1).trim()`.
  - If `process.env[key] === undefined`, set it.

### Wire into bootstrap

Locate the engine bootstrap entry point (likely `src/engine/run-cycle.ts` or `src/cli/run-one.ts`). Before the call to `loadConfig()` (or equivalent config resolution), call:

```typescript
import { loadDotEnv } from '../engine/dot-env.js';
loadDotEnv(path.join(cycleDir, '.env'));
```

Where `cycleDir` resolves to `.cycle/` relative to repo root — the same path the rest of the engine uses for `.cycle/` artifacts.

### Coverage gate

Register `src/engine/dot-env.ts` in `scripts/coverage-gate.mjs` `FLOORS` table with a **100% line coverage floor** (follows the `src/engine/path-utils.ts` precedent for small utility modules).

## Acceptance Criteria

- [ ] With `.cycle/.env` containing `CYCLE_TRUNK_BASED=1` and no shell export, `cycle run` resolves `commit.mode` to `trunk`. Verify via a `cycle.checkout … reason: "trunk"` log entry or equivalent observable behavior.
- [ ] A real exported env var takes precedence over the file (real-env-wins rule).
- [ ] `--trunk` CLI flag still takes precedence (it sets `process.env.CYCLE_TRUNK_BASED` before bootstrap runs).
- [ ] Blank lines, `#`-prefixed comment lines, and lines with no `=` are silently skipped.
- [ ] Missing `.cycle/.env` is a no-op (no thrown error, no log noise).
- [ ] Tests cover all five cases above. `src/engine/dot-env.ts` must reach 100% line coverage.
- [ ] `npm test` and `npm run check:coverage` pass with no regressions.

## References

- RFC-003 §1b, §7
- CLAUDE.md §Workflow style (trunk-based enforcement)
- `src/cli.ts:125` (`--trunk` flag)
- `src/engine/workflow.ts:86` (`CYCLE_TRUNK_BASED` reader)
- `src/engine/path-utils.ts` (precedent for 100%-floor utility module)
- `scripts/coverage-gate.mjs` (`FLOORS` table)
