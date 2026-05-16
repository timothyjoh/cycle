Enough context gathered. Writing RESEARCH.md now.

```markdown
# Research: Cycle 0102

## Cycle Context

Cycle 0102 creates `src/defaults/prompts/verify.md` — a two-phase claudecode verify prompt that (1) reads SPEC.md and runs a targeted per-AC assertion before (2) running the test suite. Both `src/defaults/workflows.yml` and `.cycle/workflows.yml` must have every verify step changed from `agent: bash, command: scripts/verify.sh` to `agent: claudecode, prompt: prompts/verify.md`. After `npm run sync-defaults`, `.cycle/prompts/verify.md` must be byte-identical to `src/defaults/prompts/verify.md`.

## Current Codebase State

### Relevant Components

- **`src/defaults/prompts/verify.md`**: Does NOT exist. Must be created fresh by this cycle.
- **`.cycle/prompts/verify.md`**: Does NOT exist. Created by `npm run sync-defaults` after the source file is written.
- **`src/defaults/workflows.yml`**: Defines feature, quickfix, and e2e-tests workflows. All three have verify steps — `{ name: verify, agent: bash, command: scripts/verify.sh }` — at lines 21, 33, 47.
- **`.cycle/workflows.yml`**: Defines feature, document, quickfix, and e2e-tests workflows — 4 workflows vs 3 in the source. All four have verify steps using `agent: bash, command: scripts/verify.sh` at lines 28, 41, 53, 65.
- **`src/defaults/scripts/verify.sh`**: Shell script (18 lines) that runs `npm test`, `cargo test`, or `pytest` depending on project type, or passes trivially if none detected — `src/defaults/scripts/verify.sh:1–18`.
- **`.cycle/scripts/verify.sh`**: Byte-identical to `src/defaults/scripts/verify.sh`. Not touched by this cycle.
- **`scripts/sync-defaults.mjs`**: Copies all files under `src/defaults/` → `.cycle/`. Uses sha256-based divergence guard: skips files whose `.cycle/` copy has been locally modified since last sync. New destination files (no prior `.cycle/` counterpart) are always copied — `scripts/sync-defaults.mjs:100–121`.

### Existing Patterns to Follow

- **Prompt file structure**: All prompts are Markdown. Begin with a `# Title` heading. Use `##` sections for logical phases. Imperatives throughout (no "you should" — use "you must" / direct commands). Discovery section first (`## Discover Cycle Context First` with numbered steps), then action sections, then output section. See `src/defaults/prompts/review.md:1–27` for the canonical discovery block.
- **Two-phase sequencing**: The review prompt (review.md) uses `## Pass 1`, `## Pass 2`, `## Pass 3` as labeled phases — `src/defaults/prompts/review.md:25–103`. The new verify.md should use `## Phase 1` / `## Phase 2` per SPEC.
- **Output to stdout pattern**: Every claudecode prompt writes its primary output to stdout with the instruction "output this content to stdout — the engine captures stdout and writes it to `docs/cycle/<cycle_id>-<workflow>-<slug>/<FILE>.md`." Verify does not produce a persistent artifact — it exits 0 or non-zero.
- **Non-zero exit on failure**: Prompts instruct the agent to "emit `MUST-FIX` and exit non-zero if any check fails."
- **Concrete assertions**: The research.md prompt and build.md prompt reference `grep`, `stat`, `node -e` as acceptable targeted checks — this is the pattern the verify prompt must follow for per-AC assertions.
- **Workflow step shape**: YAML inline object `{ name: verify, agent: claudecode, prompt: prompts/verify.md }` — matches the style of every other claudecode step in both workflow files — `src/defaults/workflows.yml:15–19`.

### Dependencies & Integration Points

- **`scripts/sync-defaults.mjs` divergence guard**: The guard skips `.cycle/` files that have been locally modified from their last-synced state. `.cycle/workflows.yml` is divergent-by-design (trunk vs branch/PR divergence). When `npm run sync-defaults` runs, `.cycle/workflows.yml` **will be skipped** (locally divergent). Only `src/defaults/prompts/verify.md` → `.cycle/prompts/verify.md` will sync (new file, no prior `.cycle/` counterpart). Therefore, `.cycle/workflows.yml` must be updated directly, not via sync.
- **`.cycle/workflows.yml` divergence comment**: Lines 11–16 contain an explicit comment: `# LOCAL DIVERGENCE FROM src/defaults/workflows.yml` explaining the trunk-based differences (no_branch:true, commit-trunk.sh, no pr step, document workflow added). This comment must be preserved.
- **`document` workflow in `.cycle/workflows.yml`**: This workflow exists only in `.cycle/workflows.yml` (not in `src/defaults/workflows.yml`). It has its own verify step at line 41. The SPEC says "all verify steps" — this step must also be updated.
- **Engine step dispatch**: `src/engine/run-cycle.ts` reads step config from `workflow.steps`. An `agent: claudecode` step invokes `exec-claudecode.ts`; an `agent: bash` step invokes `exec-bash.ts`. Changing verify from bash to claudecode changes which executor runs it — `src/engine/run-cycle.ts` (exact dispatch line to confirm in plan step).

### Test Infrastructure

- **Framework**: Vitest (`npm test` runs `vitest run`). Test files under `test/` with `.test.ts` suffix.
- **Coverage**: `npm run test:coverage` produces LCOV at `.cycle/coverage.lcov`. `npm run check:coverage` enforces per-file floors. Baseline: line ≥ 95%, branch ≥ 75%, function ≥ 90%.
- **No new unit tests required**: Per SPEC Testing Strategy, prompt files are not executable code. Manual verification (`grep -c`, `cmp`) is the test strategy.
- **Test suite baseline**: 434 tests, 0 failures (as of cycle 0099 baseline).

## Code References

- `src/defaults/workflows.yml:21` — feature workflow verify step: `{ name: verify, agent: bash, command: scripts/verify.sh }`
- `src/defaults/workflows.yml:33` — quickfix workflow verify step (same shape)
- `src/defaults/workflows.yml:47` — e2e-tests workflow verify step (same shape)
- `.cycle/workflows.yml:11–16` — divergence comment block to preserve
- `.cycle/workflows.yml:28` — feature workflow verify step
- `.cycle/workflows.yml:41` — document workflow verify step (`.cycle`-only workflow)
- `.cycle/workflows.yml:53` — quickfix workflow verify step
- `.cycle/workflows.yml:65` — e2e-tests workflow verify step
- `scripts/sync-defaults.mjs:100–121` — copy loop with divergence guard logic
- `scripts/sync-defaults.mjs:104–113` — isDivergent check: skips if dst sha ≠ src sha AND dst sha ≠ recorded dst_sha256
- `src/defaults/scripts/verify.sh:1–18` — current bash verify implementation (not modified by this cycle)
- `src/defaults/prompts/review.md:1–10` — canonical prompt header/title pattern
- `src/defaults/prompts/review.md:25–103` — two-phase structure using labeled passes

## Open Questions

1. **`document` workflow verify step**: SPEC says "both workflow files" and "all verify steps." Does this include the `document` workflow's verify step at `.cycle/workflows.yml:41`? The document workflow is `.cycle`-only and runs on doc/prompt edits. The SPEC does not explicitly call it out, but "all verify steps" is unambiguous. Planner should confirm and include it.
2. **Sync-defaults and `.cycle/workflows.yml`**: The plan must explicitly sequence: (a) update `.cycle/workflows.yml` manually, (b) run `npm run sync-defaults` to create `.cycle/prompts/verify.md`, (c) verify `cmp` passes. The planner must NOT assume sync-defaults updates `.cycle/workflows.yml`.
3. **Verify prompt output**: Should `verify.md` write a persistent file (like `VERIFY.md`) or only exit 0/non-zero? No other workflow currently produces a verify artifact — the pattern is exit code only.
```
