All data gathered. Writing RESEARCH.md now.

```markdown
# Research: Cycle 0190

## Cycle Context

Swap the `reflection` and `documentation` steps in the feature workflow so
reflection runs before documentation. Currently `src/defaults/workflows.yml`
has `documentation` at position 8 (index 7) and `reflection` at position 9
(index 8). The change affects four source files — the two YAML files, three
test files, and one doc file — with no prompt content changes.

## Current Codebase State

### Relevant Components

- **Feature workflow definition (source of truth)**: `src/defaults/workflows.yml:20-28`
  — 9-step list ending `…verify → documentation → reflection`. The two terminal
  steps use inline YAML object syntax `{ name: documentation, … }` / `{ name:
  reflection, … }`.

- **Feature workflow definition (dogfood copy)**: `.cycle/workflows.yml:20-28`
  — byte-identical to `src/defaults/workflows.yml` at present (confirmed by
  reading both files; same content including comment header).

- **Step-order pinning test (defaults)**: `tests/defaults/feature-yaml.test.ts:11`
  — `assert.deepEqual(names, ["spec","research","plan","build","review","fix","verify","documentation","reflection"])`.
  Also asserts `feature.steps.length === 9` at line 12.

- **Step-order pinning test (dogfood)**: `tests/dogfood/feature-yaml.test.ts:13`
  — identical deepEqual array as above. A second test in the same file
  (lines 17-27) asserts no `commit`/`pr` steps and checks `engine.commit.mode`
  — this test is unaffected by the swap.

- **Feature-loadable integration test**: `tests/defaults/feature-loadable.test.ts:14-20`
  — loads `src/defaults/workflows.yml` via the engine, then checks:
  - `w.steps.length === 9` (line 14)
  - `w.steps[6].agent === "bash"` (line 16) — verify step, unaffected
  - `w.steps[7].name === "documentation"` (line 17)
  - `w.steps[7].agent === "claudecode"` (line 18)
  - `w.steps[8].name === "reflection"` (line 19)
  - `w.steps[8].agent === "claudecode"` (line 20)
  Both index-7 and index-8 name assertions flip after the swap.

- **ARCHITECTURE.md step sequence (prose example)**: `docs/ARCHITECTURE.md:496`
  — `` `spec → research → plan → build → review → fix → verify → documentation → reflection → commit → pr` ``

- **ARCHITECTURE.md step sequence (walkthrough narrative)**: `docs/ARCHITECTURE.md:663`
  — `` `spec → research → plan → build → review → fix → verify → documentation → reflection → commit → pr` ``

- **ARCHITECTURE.md prose about terminal steps**: `docs/ARCHITECTURE.md:500`
  — `` `documentation` and `reflection` are non-fatal terminal steps `` — names
  only, no order implied, no change needed.

### Existing Patterns to Follow

- **YAML inline object syntax**: both terminal steps use `{ name: X, agent:
  claudecode, prompt: prompts/X.md }` on a single line with consistent spacing.
  `src/defaults/workflows.yml:27-28`.

- **sync-defaults divergence guard**: `scripts/sync-defaults.mjs:100-121` —
  sha256-based; if `.cycle/workflows.yml` sha differs from both the recorded
  dst sha and the new src sha, the file is skipped and script exits 2. Because
  the two files are currently byte-identical, a plain `npm run sync-defaults`
  (no `--force`) will overwrite `.cycle/workflows.yml` without triggering the
  guard.

- **Test assertion style**: `assert.deepEqual(names, [...])` for order,
  `assert.equal(feature.steps.length, N)` for count. Both files use
  `node:assert` strict mode. `tests/defaults/feature-yaml.test.ts:11-12`,
  `tests/dogfood/feature-yaml.test.ts:13-14`.

- **Arrow sequence format in ARCHITECTURE.md**: backtick-fenced inline code,
  step names separated by ` → `, `commit → pr` appended (engine-managed, not
  in YAML). `docs/ARCHITECTURE.md:496`, `docs/ARCHITECTURE.md:663`.

### Dependencies & Integration Points

- `scripts/sync-defaults.mjs` copies every file under `src/defaults/` →
  `.cycle/`, preserving relative paths. `workflows.yml` maps 1-to-1.
  `scripts/sync-defaults.mjs:17-18,83-84`.

- `src/engine/workflow.ts` (loaded by `feature-loadable.test.ts` via
  `loadWorkflow(root, "feature")`) — not modified; it reads whatever YAML is in
  `.cycle/workflows.yml`. The test exercises the engine loader path end-to-end.
  `tests/defaults/feature-loadable.test.ts:6,13`.

- `package.json` `sync-defaults` script: `node scripts/sync-defaults.mjs`
  (per CLAUDE.md — not read directly but confirmed by CLAUDE.md commands table).

### Test Infrastructure

- **Framework**: Node built-in `node:test` + `node:assert` (strict).
- **Runner**: `npm test` → `pretest` builds (`npm run build`), then
  `node --experimental-strip-types --test 'tests/**/*.test.ts'`.
- **Node requirement**: ≥ 22.6 (`--experimental-strip-types`).
- **Naming**: `tests/<area>/<subject>.test.ts`.
- **Coverage**: `npm run test:coverage` + `npm run check:coverage` enforces
  per-file floors. Scripts (`scripts/**`) are included in coverage. No
  per-file floor is registered for the three test files being changed — they
  are test files, not source files.
- **Current passing count**: 531 tests (per obs 2490).

## Code References

- `src/defaults/workflows.yml:27` — `{ name: documentation, agent: claudecode, prompt: prompts/documentation.md }`
- `src/defaults/workflows.yml:28` — `{ name: reflection,    agent: claudecode, prompt: prompts/reflection.md }`
- `.cycle/workflows.yml:27-28` — byte-identical to above
- `tests/defaults/feature-yaml.test.ts:11` — deepEqual array with `"documentation"` at index 7, `"reflection"` at index 8
- `tests/dogfood/feature-yaml.test.ts:13` — same deepEqual array
- `tests/defaults/feature-loadable.test.ts:17-20` — index-7/8 name assertions
- `docs/ARCHITECTURE.md:496` — step sequence string (first occurrence)
- `docs/ARCHITECTURE.md:663` — step sequence string (second occurrence)
- `scripts/sync-defaults.mjs:100-121` — divergence-guard copy loop

## Open Questions

None. All touch points are fully identified and the change is mechanical: two
lines swap in YAML, three test assertion strings update, two doc lines update,
`npm run sync-defaults` propagates the YAML change.
```
