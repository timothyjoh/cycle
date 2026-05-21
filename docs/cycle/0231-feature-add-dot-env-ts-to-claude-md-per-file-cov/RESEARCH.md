# Research: Cycle 0231

## Cycle Context

Cycle 0231 corrects a documentation drift: `src/engine/dot-env.ts` was introduced in cycle 0225 with a 100% line coverage floor enforced by `scripts/coverage-gate.mjs`, but the per-file floors list in `CLAUDE.md` was not updated at that time. The sole deliverable is appending `` `src/engine/dot-env.ts` (100%) `` to the per-file floors bullet in `CLAUDE.md`'s Coverage policy section, following the pattern used for `path-utils.ts`, `engine-lock.ts`, `child-env.ts`, and `log-fmt.ts`.

## Current Codebase State

### Key Finding: CLAUDE.md Already Contains the Entry

**`CLAUDE.md` line 37 already lists `src/engine/dot-env.ts` (100%)** in the per-file floors bullet. The current text reads:

```
- **Per-file floors**: `src/engine/triage.ts` (95%), `src/engine/issue-lifecycle.ts` (95%),
  `src/engine/commit-cycle.ts` (95%), `src/engine/branch.ts` (90%), `src/engine/stale-dist.ts` (95%),
  `src/cli/run-one.ts` (70%), `scripts/sync-defaults.mjs` (90%), `src/cli/cleanup.ts` (70%),
  `src/engine/path-utils.ts` (100%), `src/engine/engine-lock.ts` (100%),
  `src/engine/child-env.ts` (100%), `src/engine/log-fmt.ts` (100%),
  `src/engine/dot-env.ts` (100%), `src/engine/queue.ts` (90%), `src/engine/run-cycle.ts` (90%).
  Enforced by `scripts/coverage-gate.mjs` (LCOV-driven). ...
```

The documented floors in `CLAUDE.md` and the FLOORS table in `scripts/coverage-gate.mjs` are **not fully in sync**, however. The script enforces additional floors not listed in `CLAUDE.md`:

| Entry | `coverage-gate.mjs` | `CLAUDE.md` |
|---|---|---|
| `scripts/structural-invariants.mjs` (90%) | present (line 20) | absent |
| `src/engine/exec-spawn.ts` (90%) | present (line 22) | absent |
| `src/engine/reflection.ts` (95%) | present (line 31) | absent |

The SPEC scope explicitly excludes auditing other potential drift items.

### Relevant Components

- **`CLAUDE.md`**: Human-readable project conventions, Coverage policy section — `CLAUDE.md:34–38`
- **`scripts/coverage-gate.mjs`**: Authoritative FLOORS table enforced at build time — `scripts/coverage-gate.mjs:12–31`
- **`src/engine/dot-env.ts`**: 23-line module exporting `loadDotEnv(filePath)`. Reads `.env`-style files; skips blank lines and `#` comments; real-env-wins precedence (does not overwrite existing env vars); silently no-ops on ENOENT — `src/engine/dot-env.ts:1–23`
- **`src/cli.ts`**: Imports and calls `loadDotEnv` at bootstrap — `src/cli.ts:28`, `src/cli.ts:139`

### Existing Patterns to Follow

- **Per-file floors inline format**: Each entry is `` `src/path/to/file.ts` (N%) `` separated by commas in a single bullet on line 37 of `CLAUDE.md`
- **Ordering**: Entries follow the same order as they appear in the `FLOORS` object in `coverage-gate.mjs` (insertion order)
- **No trailing entry**: The bullet ends with `. Enforced by \`scripts/coverage-gate.mjs\`...`

### Dependencies & Integration Points

- `scripts/coverage-gate.mjs` FLOORS table — `scripts/coverage-gate.mjs:12–31` — is the machine-enforced source of truth; `CLAUDE.md` line 37 is the human-readable mirror
- `tests/engine/dot-env.test.ts` — 7 tests covering ENOENT no-op, KEY=VALUE parsing, blank lines, comments, no-`=` lines, real-env-wins, and CYCLE_TRUNK_BASED integration smoke — `tests/engine/dot-env.test.ts:1–115`
- `tests/scripts/coverage-gate.test.ts` — references `src/engine/dot-env.ts` in fixture data at lines 34, 88, 152

### Test Infrastructure

- **Framework**: Node.js built-in `node:test` with `node:assert`
- **Run command**: `npm test` (auto-builds via `pretest`, then runs test suite)
- **Coverage command**: `npm run test:coverage` followed automatically by `npm run check:coverage` (LCOV-driven via `scripts/coverage-gate.mjs`) and `npm run check:invariants`
- **Coverage of change area**: No test exercises `CLAUDE.md` content directly. The change is documentation-only; `npm test` passes without any logic changes.
- **Structural invariants**: `scripts/structural-invariants.mjs` enforces build-time rules; none currently validate CLAUDE.md ↔ coverage-gate.mjs synchrony

## Code References

- `CLAUDE.md:34–38` — Coverage policy section containing the per-file floors bullet
- `CLAUDE.md:37` — The single line listing all per-file floors; `dot-env.ts` already present
- `scripts/coverage-gate.mjs:12–31` — FLOORS table; `dot-env.ts` at line 27 with floor 100
- `src/engine/dot-env.ts:1–23` — Full implementation of `loadDotEnv`
- `src/cli.ts:28` — `import { loadDotEnv } from "./engine/dot-env.ts"`
- `src/cli.ts:139` — `loadDotEnv(join(cwd, ".cycle", ".env"))`
- `tests/engine/dot-env.test.ts:1–115` — Full test suite for `loadDotEnv`
- `tests/scripts/coverage-gate.test.ts:34,88,152` — Fixture references to `src/engine/dot-env.ts`

## Open Questions

1. **`dot-env.ts` is already present in `CLAUDE.md` line 37.** The SPEC states it is absent, but the current file contains it. The planner must decide: (a) confirm the change is already done and the cycle should close as a no-op, or (b) determine whether the entry was added by a prior cycle without closing this issue, and close accordingly.

2. **Three additional entries in `coverage-gate.mjs` are absent from `CLAUDE.md`** (`structural-invariants.mjs` at 90%, `exec-spawn.ts` at 90%, `reflection.ts` at 95%). The SPEC explicitly scopes this cycle to `dot-env.ts` only; the planner must confirm those remain out of scope for this cycle.
