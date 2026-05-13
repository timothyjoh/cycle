---
id: re-triage-flag-triage-handling
title: "Triage: consume `re_triage: true` raws and re-decompose with provenance preserved"
workflow: feature
depends_on: [re-triage-flag-engine-detection]
triaged_at: "2026-05-13T18:15:57.095Z"
source: triage
parent: re-triage-flag
---
## Why

Once the engine can punt a `todo/<id>.md` back to `raw/` with `re_triage: true` (see [[re-triage-flag-engine-detection]]), triage must recognize that signal and treat the raw as "this is real work that needs further decomposition" rather than as a brand-new drop. The previous triage attempt's output is a hint, not a constraint; the new pass should be free to re-break-down the work, but it must preserve provenance so we can audit why a piece of work was re-triaged.

## Scope

Extend `src/engine/triage.ts` (and the triage prompt at `src/defaults/prompts/triage.md`) to handle raws with `re_triage: true`.

- Frontmatter passthrough into the prompt:
  - When building the per-raw prompt, if the raw's frontmatter has `re_triage: true`, include in the "Inputs" section a small `## Re-triage context` block with: the prior `id`, the prior `title`, `re_triage_count`, `re_triage_reason` (if present), and the body of the previous triage output for this id (read from `done/<prior_id>_raw.md` if present, otherwise omit). This gives the agent enough context to make a better second-pass decision without re-deriving everything from scratch.
  - Document in the prompt that a re-triaged raw is expected to be **decomposed further** (the engine punted it precisely because the prior shape was wrong). The agent may still choose enrich-only if the prior decomposition was right and the issue just needs different framing, but the default should be decomposition.
- Frontmatter propagation onto new children: every child produced from a re-triaged raw inherits:
  - `re_triaged_from: <prior_id>`
  - `re_triage_generation: <re_triage_count>` (i.e. how many times the lineage has been re-triaged)
  These fields go into the generated todo file's frontmatter — author them in `triage.ts` after the agent returns, not inside the agent's JSON body (the agent should not have to manage provenance bookkeeping).
- The `re_triage: true` flag is consumed by triage and **must not** appear on any child. The original raw is moved to `done/<raw_id>_raw.md` per the existing triage flow (no special case there).
- The schema validator must continue to reject children that include `re_triage` in their frontmatter (defensive: we never want a child born already-flagged).
- Cross-reference with [[re-triage-flag-loop-guard]]: that issue handles the runaway-loop case. This issue assumes the loop guard exists at runtime and only needs to provide the `re_triage_count` value via frontmatter for the guard to read.

## Acceptance

- Unit tests in `tests/engine/triage-re-triage.test.ts`:
  - Raw with `re_triage: true` and `re_triage_count: 1` triages successfully; produced children have `re_triaged_from` and `re_triage_generation: 1` in their frontmatter.
  - Prompt rendering test asserts the `## Re-triage context` block is included when the raw is flagged and absent otherwise.
  - Validator rejects a JSON contract whose `body` smuggles a `re_triage: true` line in frontmatter (should never happen — `body` is markdown only — but assert defensively).
  - Re-triaged raw with prior `done/<prior_id>_raw.md` missing → triage still succeeds (no crash on missing prior body).
- Typecheck and full suite pass; coverage does not regress.
- Update CLAUDE.md triage paragraph to note: "raws with `re_triage: true` carry their prior context into the prompt and produce children stamped with `re_triaged_from` / `re_triage_generation`."
