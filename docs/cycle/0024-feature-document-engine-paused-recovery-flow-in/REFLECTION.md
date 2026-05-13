```json
{
  "sharp_edges": [
    {
      "title": "defer-moveToFailed-until-after-all-triage-failed-check",
      "body": "`src/engine/triage.ts:225` calls `moveToFailed` inside the per-raw failure branch — running before the `failed.length === raws.length` whole-pass check at `:233`. Consequence surfaced by cycle 0024: when the engine pauses on `all_triage_failed`, every raw has already been renamed to `docs/cycle/issues/failed/<id>.md` with `failed_step: \"triage\"` stamped, even though no cycle was started and the operator hasn't decided whether to give up on those raws. This forced the README recovery flow into a convoluted `mv failed/<id>.md raw/<id>.md` restore loop just to let `cycle triage --dry-run` (which reads only `raw/`) see them again.\n\nDeferring `moveToFailed` until after the whole-pass result is known would let raws stay in `raw/` on `engine.paused`, collapsing the recovery flow from \"restore, edit, dry-run, re-fire\" to \"edit, dry-run, re-fire.\" `moveToFailed` would still run in the partial-failure path where some raws decomposed successfully — only the all-fail path would skip it. MUST-FIX.md Task 1 explicitly calls this out as a deferred engine cycle.\n\nSuggested direction: split the per-raw failure handling so frontmatter `bumpAttempts` (and the per-attempt `triage.raw.failed` log events) still run on each attempt, but the `raw/ → failed/` rename is collected and only flushed when at least one raw decomposed cleanly. Update README + RFC-001 §5 + CLAUDE.md to drop the restore step once the code lands.",
      "priority_hint": 7
    },
    {
      "title": "docs-only-cycles-need-semantic-verification-step",
      "body": "Cycle 0024's PLAN §Verification only specified grep-for-field-names and slug-resolution checks. Both passed, but the README still documented a recovery flow that fails on first command because the structural checks never cross-referenced the doc against `src/engine/triage.ts`. REVIEW.md adversarial section called this out: \"editorial verification was the test surface for this cycle, and it failed.\" The doc-vs-code drift required a full NEEDS-FIX round.\n\nFor docs-only cycles that describe runtime behavior (recovery flows, command outputs, log payloads), the verification phase should include a \"replay the doc against current code\" pass — either by tracing each documented command/path back to its implementation, or by adding a checklist of \"does this prose match the symbol it names?\" prompts. Pure grep/anchor checks catch structural problems but cannot catch fiction.\n\nSuggested direction: add a verification clause to the `feature` workflow's docs-track prompts (or a new `docs` workflow variant) that requires the build-step agent to enumerate every command, path, and behavioral claim in the new prose and pair it with a file:line reference proving the claim holds at HEAD. The grep checks stay; this adds the semantic layer.",
      "priority_hint": 5
    }
  ]
}
```
