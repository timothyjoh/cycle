---
id: refl-0217-spec-md-negative-example-hardcodes-cycle
title: Replace hardcoded cycle-0217 path in spec.md negative example with generic placeholder
workflow: feature
depends_on: []
triaged_at: "2026-05-21T10:10:53.586Z"
source: triage
---
## Problem

`src/defaults/prompts/spec.md` line 129 embeds the literal path `docs/cycle/0217-feature-fix-spec-step-learning-mode-conflict-cau/SPEC.md` inside the negative example block. After cycle 0217 this path references a historical artifact directory, not a live current-cycle path. As cycles accumulate the example will point to a directory from cycles ago, making it contextually irrelevant to the model and potentially confusing — the model may discount the example as stale rather than treating it as a live guardrail.

The pedagogically important part of the negative example is the leading confirmation-sentence pattern, not the specific cycle number in the path.

## Fix

One-liner change in `src/defaults/prompts/spec.md`: replace the hardcoded cycle-specific path with a generic placeholder.

**Before:**
```
docs/cycle/0217-feature-fix-spec-step-learning-mode-conflict-cau/SPEC.md
```

**After:**
```
docs/cycle/NNNN-feature-<title>/SPEC.md
```

After editing `src/defaults/prompts/spec.md`, run `npm run sync-defaults` to propagate the change to `.cycle/prompts/spec.md`.

## Acceptance Criteria

- [ ] `src/defaults/prompts/spec.md` negative example path uses a generic placeholder (no hardcoded cycle number)
- [ ] `.cycle/prompts/spec.md` is in sync (`npm run sync-defaults` run and output committed)
- [ ] `npm test` passes
- [ ] `npm run typecheck` passes
- [ ] No coverage regression vs baseline
