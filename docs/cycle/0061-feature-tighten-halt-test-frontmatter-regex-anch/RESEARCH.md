```markdown
# Research: Cycle 0061

## Cycle Context
Test-only hardening: right-anchor two `assert.match` patterns in `tests/cli/halt.test.ts` (lines 266–267) so `failed_step` and `failed_attempts` match the strict `/^…$/m` full-line form already used by the adjacent `last_cycle_id` assertion. No production code changes.

## Current Codebase State

### Relevant Components
- Halt test fixture: drives `cycle run` against a temp repo and asserts terminal-fail frontmatter — `tests/cli/halt.test.ts:237-276` (the `propagateBlocked moves dependent to blocked/...` test, where the two loose anchors live).
- Loose-anchor assertions to tighten — `tests/cli/halt.test.ts:266` (`/^failed_step: verify/m`) and `tests/cli/halt.test.ts:267` (`/^failed_attempts: 1/m`).
- Adjacent strict-anchor template — `tests/cli/halt.test.ts:268` (`new RegExp(\`^last_cycle_id: "${cycleId}"$\`, "m")`).
- Frontmatter writer (deterministic fixture output) — `src/cli.ts:120-158` `terminalDrain` calls `mutateFrontmatter` with keys `failed_at`, `failed_step` (omitted when `failingStep` is `undefined`), `failed_attempts`, `last_cycle_id`. Lines 135–137 emit the three keys the test pins.
- Fixture wiring that makes the values deterministic: `workflowYml(2, 1)` at `tests/cli/halt.test.ts:71-87` sets a single workflow step named `verify` and `max_cycle_attempts: 1`, so `failingStep` is the literal string `verify` and `failedAttempts` is the literal `1` for the failing `A` issue.

### Existing Patterns to Follow
- Full-line frontmatter assertion form: `assert.match(body, /^<key>: <value>$/m)`. Used in this file at:
  - `tests/cli/halt.test.ts:268` — `last_cycle_id` (template-literal form).
  - `tests/cli/halt.test.ts:299` — `/^blocked_by: \[A\]$/m`.
  - `tests/cli/halt.test.ts:300` — `/^blocked_by: \[B\]$/m`.
- Loose prefix-anchor form (`/^<key>: <value>/m`, no trailing `$`) — only at `tests/cli/halt.test.ts:266-267` plus the intentionally open-ended `^failed_at: /m` at line 265 (open-ended is correct there: the value is a non-deterministic ISO timestamp).

### Dependencies & Integration Points
- Test runner: Node native `node:test` via `npm test`; auto-builds `dist/cycle.js` through the `pretest` script before running.
- Halt test relies on `dist/cycle.js` already existing: `ensureDist` at `tests/cli/halt.test.ts:10-14` reads `dist/cycle.js` (does NOT rebuild on its own; depends on the `pretest` hook).
- Frontmatter mutation path: `mutateFrontmatter` (imported by `src/cli.ts`) writes deterministic YAML key order; the fixture pinning `verify` and `1` survives unchanged because no production source is touched.

### Test Infrastructure
- Framework: `node:test` + `node:assert` (strict). No mocking — the test bootstraps a real temp repo, spawns the bundled CLI, and asserts on real filesystem artifacts + `.cycle/log.jsonl` events.
- Convention: each `test(...)` allocates its own `mkdtemp` root and cleans up via `finally { rm(..., recursive, force) }`.
- Coverage: `src/engine/triage.ts ≥ 95%` per-file floor enforced by `scripts/coverage-gate.mjs`. This change touches no `src/` files, so the line/branch/func gates and the triage per-file floor are coverage-neutral.

## Code References
- `tests/cli/halt.test.ts:265` — `assert.match(failedBody, /^failed_at: /m);` (intentionally loose — ISO timestamp; out of scope).
- `tests/cli/halt.test.ts:266` — `assert.match(failedBody, /^failed_step: verify/m);` (target of edit).
- `tests/cli/halt.test.ts:267` — `assert.match(failedBody, /^failed_attempts: 1/m);` (target of edit).
- `tests/cli/halt.test.ts:268` — `assert.match(failedBody, new RegExp(\`^last_cycle_id: "${cycleId}"$\`, "m"));` (reference form).
- `src/cli.ts:135-137` — emits the three frontmatter keys whose values the test pins.
- `tests/cli/halt.test.ts:71-87` — `workflowYml` factory; locks step name `verify` and `max_cycle_attempts: 1` into the fixture.

## Open Questions
None. SPEC is unambiguous: two literal regex-pattern edits at known line numbers; deterministic fixture values are already pinned by `workflowYml(2, 1)` and the single-step `verify` workflow.
```
