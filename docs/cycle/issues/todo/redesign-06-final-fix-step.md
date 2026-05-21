---
id: redesign-06-final-fix-step
title: Add final_fix + final_verify steps to the feature workflow for in-cycle remediation
workflow: feature
depends_on: [redesign-04-footprint-json-and-scope-guard-demote]
triaged_at: "2026-05-21T12:53:57.308Z"
source: triage
---
## Context

Reflection runs after `fix`, so trivial in-scope sharp edges it surfaces cannot be remediated within the cycle that produced them — they spill into future cycles. A bounded, mechanical, in-footprint fix pass *before* the cycle commits eliminates the cheapest class of deferred work at its source.

See [RFC-003 §2](../../../RFC-003-in-cycle-remediation-and-priority-routing.md) for full rationale.

**Prerequisite:** `redesign-04-footprint-json-and-scope-guard-demote` must land first. `final_fix` depends on `touched.json` for footprint-confinement, and the scope guard must be non-blocking before `final_fix` can legitimately expand the footprint.

This issue can ship with an empty/placeholder FINAL_FIXES contract — reflection does not yet produce it (that lands in redesign-07). Until then `final_fix` is always skipped (no `FINAL_FIXES.md` present), so the workflow stays green.

## New workflow tail

Extend `src/defaults/workflows.yml` (+ `.cycle/workflows.yml` via `npm run sync-defaults`) from:

```
… fix → verify → reflection → documentation
```

to:

```
… fix → verify → reflection → final_fix → final_verify → documentation
```

New step definitions to add:

```yaml
- { name: final_fix,    agent: claudecode, prompt: prompts/final_fix.md, skip_unless: FINAL_FIXES.md }
- { name: final_verify, agent: bash,       command: scripts/verify.sh }
```

## Implementation details

### `final_fix` step

- Reads `FINAL_FIXES.md` (written by reflection; absent until redesign-07 → step skipped).
- Constrained by prompt to modify only files already in `touched.json` (engine-owned footprint from redesign-04), plus tests and docs.
- NOT named `fix`, so it does NOT inherit the `fix`-keyed guards in `src/engine/run-cycle.ts` (empty-diff check and fix-vs-MUST-FIX check at the `step.name === "fix"` branch around line 339). That is intentional — `final_verify` is `final_fix`'s gate.

### `final_verify` step

- Bash step: `scripts/verify.sh` — identical invocation to the existing `verify` step.
- **Must be named `final_verify`, not `verify`**: `src/engine/log-tail.ts:61` dedups `completedSteps` by name — a second step literally named `verify` would be collapsed and skipped on resume.

### Engine: append `final_fix` delta to `touched.json`

In `src/engine/run-cycle.ts`, extend the git-delta snapshot logic (which redesign-04 introduces for `build` and `fix`) to also fire for `final_fix`. The post-step delta must be appended to `touched.json` so `final_fix`'s changes become part of the authoritative footprint and never trigger a scope warning at commit.

The set of mutating step names that receive pre/post snapshots should be `["build", "fix", "final_fix"]` (or driven by a step-level flag if redesign-04 introduces one).

### Prompt: soft self-check in `build`, `fix`, `final_fix`

Add the following line to `src/defaults/prompts/build.md` and `fix.md` (in the closing instruction block):

> Do not finish this step until the full test suite passes (`npm test`).

The bash `verify` / `final_verify` steps remain the authoritative hard gates; this is a soft nudge to agents to not hand off a broken tree.

### New prompt: `src/defaults/prompts/final_fix.md`

Create this file. It must:
- Name `FINAL_FIXES.md` as the sole input source.
- Instruct the agent to apply each listed fix mechanically.
- Constrain edits to files already in `touched.json` (plus tests and docs); anything outside the footprint is a deferral, not a fix.
- Include the soft self-check instruction.
- Include the FILE ARTIFACT MODE directive (matching the pattern from cycle 0221 — see other prompt templates for the exact header).

After creating `final_fix.md` in `src/defaults/prompts/`, run `npm run sync-defaults` to mirror it to `.cycle/prompts/`.

## Acceptance criteria

- [ ] `feature` workflow step sequence: `reflection → final_fix (skip_unless: FINAL_FIXES.md) → final_verify (bash: scripts/verify.sh) → documentation`.
- [ ] With no `FINAL_FIXES.md`, `final_fix` is skipped and the cycle behaves identically to before.
- [ ] With a `FINAL_FIXES.md` present, `final_fix` runs and its git delta is appended to `touched.json`.
- [ ] `final_verify` step name is `final_verify` (not `verify`) — not collapsed on resume.
- [ ] `build`, `fix`, and `final_fix` prompt templates carry the soft self-check instruction.
- [ ] `src/defaults/workflows.yml` and `.cycle/workflows.yml` are byte-identical after `npm run sync-defaults`.
- [ ] `src/defaults/prompts/final_fix.md` exists and `.cycle/prompts/final_fix.md` is in sync.
- [ ] Tests cover: skip path (no `FINAL_FIXES.md`), run path (`FINAL_FIXES.md` present), footprint append (`touched.json` updated after `final_fix`), resume not skipping `final_verify`.
- [ ] Full test suite passes; coverage gates hold (line ≥ 95%, branch ≥ 75%, function ≥ 90%).
- [ ] Recommended workflow: `feature`.

## Key files

| File | Change |
|---|---|
| `src/defaults/workflows.yml` | Add `final_fix` + `final_verify` steps |
| `src/defaults/prompts/final_fix.md` | New prompt (create) |
| `src/defaults/prompts/build.md` | Add soft self-check |
| `src/defaults/prompts/fix.md` | Add soft self-check |
| `src/engine/run-cycle.ts` | Extend touched.json delta to cover `final_fix` |
| `src/engine/run-cycle.test.ts` (or equivalent) | Tests for skip/run/footprint/resume |
