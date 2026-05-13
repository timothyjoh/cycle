```json
{
  "sharp_edges": [
    {
      "title": "tsconfig-es2023-bump-needs-formal-decision",
      "body": "Cycle 0019 quietly bumped `tsconfig.json` `target: ES2022 → ES2023` and added `lib: [\"ES2023\"]` to clear pre-existing `findLast` typecheck errors at `tests/cli/multi-loop.test.ts:53,114`. BUILD.md and REVIEW.md both flag this as out-of-scope-but-necessary scope creep. The change is now sitting on master without any project-level acknowledgement: CLAUDE.md still says only \"Node ≥ 22.6\", there is no note that the codebase now relies on ES2023 lib, and no ADR / RFC documents the floor.\n\nFuture cycles will hit the same `findLast` / similar lib-version issue and re-litigate the decision. A small follow-up should: (a) add a one-line note to CLAUDE.md (\"TS target/lib: ES2023; assumes Node ≥ 22.6 at runtime\"); (b) move the `findLast` fix into a deliberate issue rather than a hidden side-effect of a one-line cycle.",
      "priority_hint": 6
    },
    {
      "title": "rfc-001-raw-drop-example-priority-mismatch",
      "body": "RFC-001 §\"Raw drop\" example uses `priority: 5`, but the SPEC for cycle 0019 mandated — and the code now emits — `priority: 3` as the default. Both values are intentional (RFC \"illustrative\", SPEC \"default\"), and SPEC explicitly forbade an RFC change in this cycle to avoid mission creep.\n\nResult: the canonical doc and the canonical writer disagree at first read. A future contributor inspecting the RFC will assume `5` is the default. Reconcile by either (a) editing the RFC example to `priority: 3` with a one-line note that 1–10 is the legal range, or (b) calling the value out as \"example only — see `materialize.ts` for the default\". Cheap, doc-only.",
      "priority_hint": 4
    },
    {
      "title": "cycle-drop-priority-flag-deferred-no-followup-filed",
      "body": "SPEC §Out of Scope for cycle 0019 deferred a `--priority` CLI flag on `cycle drop` to a follow-up, but no follow-up issue exists in `docs/cycle/issues/raw/` or `todo/` (the only sibling child filed is `cli-drop-writes-to-raw-status-command`). The deferral therefore lives only inside the cycle artifact and will be lost the next time someone scans the queue.\n\nFile a small raw issue: \"`cycle drop` accepts `--priority N` (1-10), defaults to 3 when absent; validation rejects out-of-range; threaded through `materializeFreeformIssue` as an optional arg.\" Triage can decide whether to bundle it with `status-command` or keep it standalone.",
      "priority_hint": 3
    },
    {
      "title": "cycle-run-text-path-shares-writer-but-no-test-pins-frontmatter",
      "body": "`src/cli.ts:62-64` (the `cycle run \"<text>\"` convenience path) routes through the same `materializeFreeformIssue` and now also emits `priority: 3`. RESEARCH.md, PLAN.md, and REVIEW.md all flag this as expected shared-writer fallout, but no unit or e2e test pins the byte shape on that path. The unit test in `tests/issue/materialize.test.ts` covers the function; `tests/cli/multi-loop.test.ts:123` only exercises the `drop` branch end-to-end.\n\nLow-risk: triage ignores `priority` today and the writer is shared. But if anyone ever splits the call sites (e.g. wires `--priority` into `drop` only), the `run \"<text>\"` path will silently drift. Add a one-line e2e assertion mirroring the drop test, or — cheaper — collapse the two CLI branches into a single helper so they cannot diverge.",
      "priority_hint": 2
    }
  ]
}
```
