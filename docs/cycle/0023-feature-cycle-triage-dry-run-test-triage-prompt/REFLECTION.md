```json
{
  "sharp_edges": [
    {
      "title": "spec-md-allowed-to-be-empty-in-cycle-workflow",
      "body": "Cycle 0023's `SPEC.md` is a single blank byte. REVIEW.md flagged this explicitly: 'SPEC.md is blank in the cycle dir, so this checklist is derived from PLAN.md §Desired End State and CLAUDE.md's row.' The Spec Compliance Checklist had to be reconstructed from PLAN — meaning review compares the build to the plan, not to an independent spec, defeating the spec/plan separation.\n\nThis is the second downstream artifact to skip the SPEC contract recently (cycle 0019 had partial spec drift on the priority field). The workflow's `spec` step is not enforcing that SPEC.md is non-empty or above a minimum length before handing off to plan/build/review.\n\nSuggested direction: harden the `spec` step prompt to fail loudly when SPEC.md ends up empty, or add a workflow-level guard in `runCycle` that errors out before plan if `SPEC.md` is < N bytes. Either pins the contract that review can rely on a real spec.",
      "priority_hint": 6
    },
    {
      "title": "build-and-fix-md-artifacts-leak-agent-self-narration",
      "body": "`BUILD.md` opens with 'Now sync defaults (not applicable here — no `src/defaults/` changes), and emit BUILD summary.' `FIX.md` opens with '## Summary' which is fine, but `REVIEW.md` opens with 'Now print REVIEW to stdout for engine capture.' and includes the trailing ```` ``` ```` fence around the review body. These are prompt-internal self-narration / formatting fences leaking into committed artifacts.\n\nConcrete cost: triage and reflection prompts in future cycles read these files as context. The prefixes look like instructions, not data, and downstream agents may model them as such. Diff readers see noise.\n\nSuggested direction: tighten the build/fix/review prompts so the stdout contract is the file body only, or post-process the captured stdout in `runCycle` to strip leading lines matching `^(Now|Next|Here is)\\b` and unwrap a top-level markdown fence when the entire payload is fenced.",
      "priority_hint": 4
    },
    {
      "title": "parsedtriageoutput-is-a-redundant-type-alias",
      "body": "REVIEW.md Code-Quality Finding 4 calls out `ParsedTriageOutput` at `src/engine/triage.ts:65` as a type alias for `TriageOutput` in the same file. Adds a name without a semantic shift, and the two names will silently drift the next time someone evolves one without the other.\n\nSuggested direction: inline the use sites to `TriageOutput` and delete `ParsedTriageOutput`, or rename one of the pair to encode the parse-vs-validated distinction if that is the intended axis. Tiny diff, one-shot cleanup.",
      "priority_hint": 2
    },
    {
      "title": "runclitriage-deps-param-leaks-mock-surface-to-production",
      "body": "REVIEW.md Code-Quality Finding 3 flags that `runCliTriage` gained an optional `deps: TriageDeps = {}` parameter purely to unblock per-file 100/100/100 coverage on `src/cli/triage.ts`. In production, `cli.ts` calls it with `argv.slice(1)` only and the deps default to `{}`. The slot is callable, though, so a future change that threads anything from `cli.ts` could accidentally inject mock plumbing into the production path.\n\nSuggested direction: either (a) drop the `deps` param and write the missing func-coverage test as a spawn-based E2E that exercises the production path, or (b) split the file into a pure `runCliTriageWithDeps(repoRoot, argv, deps)` (unit-test entry point) and a thin `runCliTriage(repoRoot, argv)` wrapper that hard-codes the real deps and is the only export consumed by `cli.ts`. Option (b) keeps coverage and closes the leak.",
      "priority_hint": 3
    },
    {
      "title": "dry-run-untested-paths-runagent-throws-and-missing-prompt-template",
      "body": "Adversarial REVIEW Findings 3 and 3.iii list two `dryRunTriage` code paths reached only via shared coverage with `runTriage`: (a) `runAgent` throws, exercising the `try/catch` at `src/engine/triage.ts:99` and the `lastError: 'agent failed: …'` shape inside the dry-run report; (b) the prompt template file is missing, where the current code lets `readFile`'s ENOENT propagate — behavior is reasonable but undocumented and untested for the dry-run entry point.\n\nThis matters because the canonical use case (operator iterating on the triage prompt after `engine.paused`) is exactly when the prompt file is most likely to be in a half-edited / renamed / missing state, and when an agent process is most likely to crash mid-edit. Today both surface as opaque report rows or stack traces.\n\nSuggested direction: add two unit cases in `tests/engine/triage-dry-run.test.ts` — one stubs `runAgent` to throw and asserts the report row carries `status: 'failed'` and `last_error: /agent failed/`, one removes the prompt template and asserts the behavior we want (either a clean per-raw `last_error: 'prompt template missing: …'` row, or a single top-level error before any agent invocations). Pick one shape and pin it.",
      "priority_hint": 4
    }
  ]
}
```
