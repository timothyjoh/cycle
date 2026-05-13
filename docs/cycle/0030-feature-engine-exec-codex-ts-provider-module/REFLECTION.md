```json
{
  "sharp_edges": [
    {
      "title": "step-agent-narrow-union-decays-as-registry-grows",
      "body": "`src/engine/workflow.ts:7` still types `Step.agent` as the narrow union `\"claudecode\" | \"bash\"`. The runtime dispatcher (`resolveAgent` in `src/engine/exec.ts`) accepts any string, and `loadConfig` force-casts parsed YAML, so a user can write `agent: codex` in `workflows.yml` and it dispatches correctly — but the compile-time type lies. RESEARCH.md, BUILD.md, and REVIEW.md all flagged this in cycle 0030 as a deliberately-punted latent inconsistency.\n\nWith `codex` now in the registry and Gemini queued (`multi-agent-abstraction-exec-gemini` is downstream of this cycle), the union is provably stale at two sites and about to be stale at three. Each new provider widens the gap between the type and the truth, and the type's signal value erodes.\n\nDirection: widen `Step.agent` to `string`, or — better — derive it from `keyof typeof REGISTRY` so the type stays accurate without manual edits per provider. Touches `workflow.ts`, possibly `loadConfig`, and one or two tests that pattern-match the union. Single small cycle.",
      "priority_hint": 7
    },
    {
      "title": "exec-provider-modules-converging-on-copy-paste-template",
      "body": "`src/engine/exec-codex.ts` and `src/engine/exec-claudecode.ts` are now ~95% identical: same imports, same `readFile(.cycle/${promptPath})`, same `spawn` shape, same `close`/`error`/stdout/stderr wiring, same `StepResult` resolve. They differ only in (a) the binary name and (b) prompt-delivery channel (argv vs stdin). REVIEW.md noted the cycle 0030 module \"follows the `exec-claudecode.ts` template exactly\" line-for-line.\n\nGemini is queued as the next provider. Landing it via the same copy-paste produces a third near-identical module and locks in three places to keep in sync (e.g., any change to env handling, stderr capture, or error semantics). The promptPath contract redesign tracked by `refl-0029-execmodule-promptpath-contract-leaks-on` will need to be applied to all three copies.\n\nDirection: before Gemini lands, extract a shared `runAgent({ binary, argv, promptDelivery: \"argv\"|\"stdin\" })` helper in (e.g.) `src/engine/exec-spawn.ts`; reduce each provider module to a thin config object. Coordinate with the promptPath redesign so the contract change happens in one place.",
      "priority_hint": 6
    },
    {
      "title": "stdin-end-regression-would-hang-tests-not-fail-them",
      "body": "REVIEW.md adversarial finding #1: `tests/engine/exec-codex.test.ts` happy-path stub is `#!/bin/bash\\ncat\\n`, which reads stdin to EOF. The test proves the prompt reached the child, but if a future edit drops `child.stdin.end()`, `cat` blocks forever and the test hangs — Node's test runner has no default per-test timeout, so the regression surfaces as a stuck CI run, not a clear assertion failure.\n\nDirection: tighten the happy-path stub to `head -c <len>` with the exact prompt length, or add `assert.equal(r.stdout.length, body.length)` so a missing `stdin.end()` produces an immediate length-mismatch failure. Low-cost, makes the stdin-closure contract self-checking. Same idiom can extend to future stdin-based providers.",
      "priority_hint": 4
    },
    {
      "title": "exec-codex-defensive-stdin-catch-is-dead-code",
      "body": "`src/engine/exec-codex.ts:42-44` wraps `child.stdin.write(prompt); child.stdin.end()` in an empty `try/catch` to guard against a synchronous throw on the ENOENT path. BUILD.md and REVIEW.md both note the catch is unreachable in the tested code paths because the `'error'` event is async, and it drags the new module's per-file function coverage to 85.71% (below the 90% baseline that the global metric papers over).\n\nIf the `child.stdin.on(\"error\", () => {})` listener is sufficient to swallow EPIPE on the closed stdin (which the ENOENT test proves it is), the surrounding try/catch can be deleted with no behavior change and per-file func coverage climbs back to ≥90%. If the catch IS load-bearing in some Node version we haven't tested, the comment needs a concrete version + repro citation, not just \"may close stdin before write\".\n\nDirection: either remove the try/catch and re-run the ENOENT test under Node 22.x to confirm no unhandled error escapes, or replace the comment with a citation to the exact Node behavior that makes it necessary. Either resolution removes the dead-code / under-tested ambiguity.",
      "priority_hint": 4
    }
  ]
}
```
