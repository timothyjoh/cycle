---
id: refl-0056-triagedeps-runagent-field-optional-allow-require-runagent-field
title: Make TriageDeps.runAgent required; wrapper constructs real deps explicitly
workflow: quickfix
depends_on: [refl-0056-runclitriage-wrapper-delegation-has-no-d]
triaged_at: "2026-05-14T20:28:18.856Z"
source: triage
parent: refl-0056-triagedeps-runagent-field-optional-allow
---
## Problem

`TriageDeps = { runAgent?: TriageAgentRunner }` keeps `runAgent` field-optional even though `runCliTriageWithDeps` now requires the `deps` parameter at the signature level. A test that passes `{}` (or forgets to spread a partial mock) compiles cleanly and silently reaches `runAgentViaDispatch` — the real Claude/Codex/Gemini exec path — defeating the entire point of the injection seam.

The risk is non-hypothetical: the prod wrapper passes `{}` by design, so the prod path is *expected* to take the default. A forgotten mock in a future test would look identical to the prod path and only surface as a flaky network call or rate-limit error.

Cycle 0056 REVIEW.md explicitly flagged this as deferred future tightening.

## Fix

Split the type contract:

1. `type TriageDeps = { runAgent: TriageAgentRunner }` — required field on the injectable seam.
2. `runCliTriageWithDeps(opts, deps: TriageDeps)` continues to consume the required field directly — no default fallback inside the pure entry point.
3. The thin `runCliTriage` wrapper constructs `{ runAgent: runAgentViaDispatch }` explicitly at the call site, making the wrapper's job (real-deps construction) visible rather than buried.

Forces every test to be explicit about its mock. Removes the silent prod fallback from the pure code path.

## Acceptance

- `TriageDeps.runAgent` is a required field (no `?`).
- `runCliTriageWithDeps` body contains no `??` / `||` fallback to `runAgentViaDispatch`; it reads `deps.runAgent` directly.
- `runCliTriage` wrapper explicitly constructs `{ runAgent: runAgentViaDispatch }` and passes it through.
- Every existing test that previously relied on the default now passes `{ runAgent: <mock> }` explicitly (compile error surfaces forgotten cases).
- Regression test: a test that passes `{}` to `runCliTriageWithDeps` fails type-check (covered by `npm run typecheck` in CI).
- Coverage on `src/engine/triage.ts` stays ≥ 95% line (per-file floor).

## Depends on

- `refl-0056-runclitriage-wrapper-delegation-has-no-d` — the wrapper delegation test should land first so the required-field tightening doesn't reintroduce a gap in wrapper coverage.
