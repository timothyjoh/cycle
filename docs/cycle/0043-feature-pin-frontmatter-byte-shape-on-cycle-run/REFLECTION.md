{
  "sharp_edges": [
    {
      "title": "frontmatter-byte-shape-pin-misses-blank-line-between-fence-and-body",
      "body": "The new e2e test at `tests/cli/multi-loop.test.ts:175-187` pins `expectedFrontmatter` ending in `---\\n`, then asserts the body tail with `/\\npark this too\\n$/`. The writer at `src/issue/materialize.ts:23-26` emits `[\"---\", \"\", text, \"\"].join(\"\\n\")`, so the canonical output between the closing fence and the body is `---\\n\\npark this too\\n` (mandatory blank line). If a future writer change dropped that blank line, both `body.startsWith(expectedFrontmatter)` (still matches — closing `---\\n` unchanged) and the body-tail regex (still matches — the `\\n` before `park` is now the `\\n` ending `---`) would silently pass.\n\nThe same gap exists in the unit test at `tests/issue/materialize.test.ts:21-33`, so both layers leak. The fix is one character: extend the expected prefix to `\"---\\n\\n\"` in both tests. This was the explicit purpose of cycle 0043 (byte-shape pin), so closing this hole strengthens the pin against the exact class of divergence it was filed to prevent.",
      "priority_hint": 4
    },
    {
      "title": "no-direct-byte-equivalence-check-between-drop-and-run-writer-call-sites",
      "body": "Cycle 0043 chose Option A (pin `run`'s frontmatter independently) over Option B (collapse `drop` and `run \"<text>\"` into a shared helper). The result is two structurally-parallel tests at `tests/cli/multi-loop.test.ts:123-147` and `:149-197`, each pinning its own derived `expectedFrontmatter` string. Neither test compares `drop` output to `run` output directly. If a future change touches `materializeFreeformIssue` AND one of the call sites in the same diff, both tests could be updated in lockstep to still pass while the two paths silently diverge.\n\nA stronger pin would be one test that runs both commands against the same `(text, priority)` input in adjacent temp roots and asserts the two raw files' frontmatter blocks are byte-equal after substituting the timestamp-dependent `id` and `added_at` lines. That single check makes \"shared writer\" a tested invariant rather than a convention. Low priority because the writer is currently single-sourced and the unit test already covers it directly — file this as a hardening follow-up, not an urgent fix.",
      "priority_hint": 2
    },
    {
      "title": "cycle-run-dry-run-emits-log-jsonl-while-cycle-drop-does-not",
      "body": "`src/cli.ts:74-75` calls `createLogger(cwd)` and emits `engine.start` before the dry-run short-circuit at `:314-327`, so `cycle run \"<text>\" --dry-run` creates `.cycle/log.jsonl` in the consumer repo. `cycle drop` exits earlier and writes no log file. The new e2e test had to *avoid* asserting log absence (PLAN.md called this out explicitly), which signals the asymmetry is load-bearing for the test design.\n\nThis is a smell at the CLI surface: two \"materialize-only\" entry points behave differently for an externally observable side effect (a file appearing in `.cycle/`). Either consolidate by moving the dry-run short-circuit above logger creation on the `run` path (making the two paths symmetric) or document the asymmetry in CLAUDE.md so future maintainers don't accidentally remove the `engine.start` emit while \"cleaning up\". Either action takes <30 lines.",
      "priority_hint": 3
    }
  ]
}
