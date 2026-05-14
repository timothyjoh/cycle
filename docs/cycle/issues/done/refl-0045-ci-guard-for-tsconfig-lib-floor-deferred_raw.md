---
id: refl-0045-ci-guard-for-tsconfig-lib-floor-deferred
source: reflection
title: ci-guard-for-tsconfig-lib-floor-deferred-but-unfiled
added_at: "2026-05-14T16:32:39.863Z"
triage_attempts: 0
priority_hint: 3
origin_cycle_id: "0045"
---

SPEC.md line 19 lists "A CI check that pins the lib floor (separate future issue)" as out-of-scope, and RFC-002's Consequences section repeats this as "a separate, deferrable concern." Neither cycle 0045 nor any prior cycle filed an issue for it — `docs/cycle/issues/{raw,todo}/` has no row that mentions `tsconfig`, `lib`, `ES2023`, or a `target` guard.

Why it matters: RFC-002 only documents the existing state; it adds no enforcement. A future contributor (or coding agent) that lowers `target`/`lib` in `tsconfig.json` will only be caught by `npm run typecheck` once one of the existing ES2023 callers (`tests/cli/multi-loop.test.ts:53,114`) is exercised, which is a downstream signal rather than a PR-level guard. As more ES2023+ APIs land per the RFC's "add and ship" stance, the typecheck signal weakens.

Suggested direction: file a small follow-up cycle that adds a one-line check in `scripts/` (or as a `pretest:coverage` step) asserting `tsconfig.json` `target` and `lib` are `"ES2023"` (or a string listed in an allowlist), and fails CI otherwise. RFC-002 line 19 already names the contract; the guard is just a `node -e` / `jq` one-liner.
