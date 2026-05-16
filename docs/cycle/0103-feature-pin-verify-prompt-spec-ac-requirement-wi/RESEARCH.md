# Research: Cycle 0103

## Cycle Context

Cycle 0102 claimed to rewrite `src/defaults/prompts/verify.md` with a per-AC targeted verification prompt but its BUILD phase was blocked by permissions and instead wrote the `spec.md` prompt verbatim. This cycle corrects `verify.md` to contain a real claudecode-driven two-phase verify prompt (Phase 1: per-AC assertion; Phase 2: test suite run), runs `npm run sync-defaults` to create `.cycle/prompts/verify.md`, and adds `tests/defaults/verify-prompt-spec-ac.test.ts` to pin those requirements against future edits.

## Current Codebase State

### Relevant Components

- **`src/defaults/prompts/verify.md`** (wrong content): 112 lines, byte-identical to `src/defaults/prompts/spec.md`. Contains the "Write Cycle Spec" prompt — `src/defaults/prompts/verify.md:1-112`. Confirmed via `diff` exit 0.
- **`.cycle/prompts/verify.md`**: Does **not exist**. Not present in `.cycle/prompts/` directory listing. No entry for `.cycle/prompts/verify.md` in `.cycle/.sync-state.json` (only `.cycle/scripts/verify.sh` is recorded).
- **`src/defaults/prompts/spec.md`**: 112 lines, the "Write Cycle Spec" prompt — `src/defaults/prompts/spec.md:1-112`. This is what `verify.md` currently duplicates.
- **`scripts/sync-defaults.mjs`**: Copies every file under `src/defaults/` → `.cycle/` recursively, preserving subdirectory structure. Tracks sha256 pairs in `.cycle/.sync-state.json`. Protects locally-divergent destinations (skips, exit 2) unless `--force` or `CYCLE_SYNC_DEFAULTS_FORCE=1` — `scripts/sync-defaults.mjs:100-133`.
- **`tests/defaults/plan-prompt-spec-traceability.test.ts`**: Reference test shape for this cycle — `tests/defaults/plan-prompt-spec-traceability.test.ts:1-72`. Uses `node:test`, `node:assert/strict`, `node:fs/promises`. Combines phrase-match tests (`assert.ok(body.includes(...))`, `assert.match(body, /regex/)`) with a byte-equality test using `Buffer.compare` — `tests/defaults/plan-prompt-spec-traceability.test.ts:56-63`.
- **`tests/defaults/review-prompt-doc-claim-pass.test.ts`**: Second reference test — `tests/defaults/review-prompt-doc-claim-pass.test.ts:1-43`. Same framework. Uses `assert.match(body, /^## Heading$/m)` for heading assertions and `Buffer.compare` for byte-equality.
- **`tests/defaults/sync-defaults-guard.test.ts`**: Tests `scripts/sync-defaults.mjs` in isolation using `mkdtemp` temp dirs. Not directly relevant to this cycle's new test file.

### Existing Patterns to Follow

- **Test file shape**: `import { test } from "node:test"` / `import { strict as assert } from "node:assert"` / `import { readFile } from "node:fs/promises"`. No mocking. Tests read actual files on disk relative to `process.cwd()` (project root). — `tests/defaults/plan-prompt-spec-traceability.test.ts:1-4`
- **Phrase assertion pattern**: `assert.ok(body.includes("exact phrase"), "readable failure message")` for exact-string presence. `assert.match(body, /regex/m)` for pattern or heading assertions. — `tests/defaults/plan-prompt-spec-traceability.test.ts:17-21`
- **Byte-equality pattern**: `const [src, dog] = await Promise.all([readFile(SRC), readFile(DOG)])` then `assert.equal(Buffer.compare(src, dog), 0, "descriptive message")`. — `tests/defaults/plan-prompt-spec-traceability.test.ts:56-63`
- **Path constants at top**: `const PLAN_SRC = "src/defaults/prompts/plan.md"` / `const PLAN_DOG = ".cycle/prompts/plan.md"` — `tests/defaults/plan-prompt-spec-traceability.test.ts:5-8`
- **sync-defaults usage**: Run `npm run sync-defaults` (maps to `node scripts/sync-defaults.mjs`) to create/update `.cycle/prompts/verify.md` from `src/defaults/prompts/verify.md`. The script creates intermediate directories automatically — `scripts/sync-defaults.mjs:116`.

### Dependencies & Integration Points

- **`npm run sync-defaults`**: `package.json` script invoking `node scripts/sync-defaults.mjs`. Must be run after editing `verify.md` to propagate the change to `.cycle/prompts/verify.md` — `scripts/sync-defaults.mjs`.
- **`.cycle/.sync-state.json`**: Updated by sync-defaults to record `src_sha256`/`dst_sha256` pairs. After sync, will gain a new `.cycle/prompts/verify.md` entry.
- **`npm test`** (`pretest` triggers `npm run build`): Runs all tests including `tests/defaults/`. The new test file will be auto-discovered. Current baseline: 434 tests, 0 failures.
- **Node ≥ 22.6 with `--experimental-strip-types`**: TypeScript in test files runs directly — no compile step — `CLAUDE.md`.

### Test Infrastructure

- **Framework**: Node native `node:test` — no third-party test runner.
- **Directory**: `tests/defaults/` — all prompt/default regression tests live here. Currently 11 files.
- **Naming convention**: `<subject>-<what-it-guards>.test.ts` — e.g., `plan-prompt-spec-traceability.test.ts`, `review-prompt-doc-claim-pass.test.ts`.
- **Mocking**: None for prompt tests. Tests read live files from disk.
- **Coverage**: Coverage baseline is line ≥ 95%, branch ≥ 75%, function ≥ 90% — `CLAUDE.md`. The new test file (reads + asserts) will add covered lines but no new src/ branches.

## Code References

- `src/defaults/prompts/verify.md:1-112` — Currently byte-identical to spec.md; entire file must be replaced with a verify prompt
- `src/defaults/prompts/spec.md:1-112` — The "Write Cycle Spec" prompt currently duplicated in verify.md
- `.cycle/prompts/verify.md` — Does not exist; must be created by sync-defaults after verify.md is corrected
- `.cycle/.sync-state.json` — Sync state tracking file; currently has no entry for verify.md
- `scripts/sync-defaults.mjs:68-88` — `discoverPairs()` recursively enumerates `src/defaults/` to find files to copy
- `scripts/sync-defaults.mjs:100-121` — Main copy loop with divergence detection; creates destination directories automatically
- `tests/defaults/plan-prompt-spec-traceability.test.ts:1-72` — Primary reference: exact test shape, import style, phrase and byte-equality patterns
- `tests/defaults/review-prompt-doc-claim-pass.test.ts:1-43` — Secondary reference: heading regex pattern (`/^## Heading$/m`)
- `tests/defaults/` — Directory where new `verify-prompt-spec-ac.test.ts` must be created

## Open Questions

- What exact phrase(s) should the new `verify.md` contain that the test will assert on? The SPEC requires the phrase `Acceptance Criteria` in a context requiring per-AC checking plus a concrete assertion instruction (e.g., `grep`, `stat`, `node -e`). The planner must decide the precise required phrase and whether to use `assert.ok(body.includes(...))` or `assert.match(body, /regex/)` — this choice must be consistent between the prompt content and the test assertion.
- The `.cycle/.sync-state.json` currently has no entry for `verify.md`. After sync-defaults runs for the first time for this file, will the sync-defaults divergence guard interfere with future runs? (Answer derivable from `sync-defaults.mjs:104-108`: first-time copy has no recorded state, `recorded` is `undefined`, so `isDivergent` = false — no interference expected. Documenting for planner awareness.)
