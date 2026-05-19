---
id: refl-0030-stdin-end-regression-would-hang-tests-no
title: Make exec-codex happy-path test self-checking on stdin closure (no hang on missing stdin.end())
workflow: quickfix
depends_on: []
triaged_at: "2026-05-13T22:08:41.483Z"
source: triage
---
## Context

From Cycle 0030 reflection (REVIEW.md adversarial finding #1).

`tests/engine/exec-codex.test.ts` happy-path stub is `#!/bin/bash\ncat\n`. `cat` reads stdin to EOF, so the test proves the prompt reached the child — but only because `exec-codex.ts` currently calls `child.stdin.end()`. If a future edit drops that call, `cat` blocks forever waiting for EOF. Node's `node --test` runner has no default per-test timeout, so the regression surfaces as a stuck CI run (eventual outer kill) rather than a clear assertion failure pinpointing the broken contract.

## Goal

Make the stdin-closure contract self-checking: a missing `stdin.end()` must produce an immediate, localized test failure — not a hang.

## Approach options

Pick one (or combine):

1. **Length-bounded stub.** Replace `cat` with `head -c <len>` where `<len>` is the exact byte length of the test prompt. If `stdin.end()` is missing, `head` still returns after reading `len` bytes — the test continues without hanging, and a follow-up assertion on captured stdout still passes. This alone doesn't *catch* the regression; pair with option 2.
2. **Length-equality assertion.** After spawn completes, assert `r.stdout.length === body.length` (or compare full strings). With the current `cat` stub, a missing `stdin.end()` causes the spawn to never close → spawn-promise hang. So this only fires fast if combined with a timeout or a length-bounded reader.
3. **Per-test timeout.** Set `{ timeout: <small-ms> }` on the test (Node test runner supports it) so a hang surfaces as a clear timeout failure naming the test, instead of a stuck CI run.

Recommended combo: option 1 + option 2 + option 3. Stub reads exactly `body.length` bytes, test asserts stdout length matches, and a generous per-test timeout (e.g. 2000ms) is the belt-and-suspenders against unforeseen blocking.

## Scope

- `tests/engine/exec-codex.test.ts` — rewrite the happy-path stub and add the assertion + timeout.
- Apply the same idiom to any other stdin-based exec-provider tests that exist or land before this issue runs (`exec-claudecode.test.ts` if it uses the same pattern).
- Document the pattern in a one-liner near the stub so future provider modules (Gemini etc.) inherit it.

## Acceptance

- Manually deleting `child.stdin.end()` in `src/engine/exec-codex.ts` produces a failing test within seconds (length mismatch or timeout), not a hung run.
- Restoring the call returns the suite to green.
- No flake on slow CI (timeout chosen with comfortable headroom).
- `npm test` green; coverage not regressed.

## Notes

- Coordinate ordering with `refl-0030-exec-provider-modules-converging-on-copy` (shared runAgent extraction): if that lands first, fold the stub-hardening idiom into the shared test fixture rather than duplicating per provider.
- Priority hint: 4 (medium). Low-cost; pays off as more stdin-based providers land.
