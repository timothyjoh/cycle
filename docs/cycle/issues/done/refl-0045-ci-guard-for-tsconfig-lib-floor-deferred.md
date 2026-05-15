---
id: refl-0045-ci-guard-for-tsconfig-lib-floor-deferred
title: Add CI guard pinning tsconfig.json target/lib to ES2023 floor
workflow: feature
depends_on: []
triaged_at: "2026-05-14T16:34:05.407Z"
source: triage
---
## Goal

Add a PR-level guard that fails CI when `tsconfig.json` `target` or `lib` is lowered below the ES2023 floor declared in CLAUDE.md and `docs/RFC-002-typescript-es2023-floor.md`. Today the only enforcement is `npm run typecheck`, which flags a lowered floor only as a downstream signal once an existing ES2023 caller (e.g. `tests/cli/multi-loop.test.ts:53,114`) trips on a missing method — not as a deliberate PR-level contract check.

## Context

- RFC-002 (`docs/RFC-002-typescript-es2023-floor.md`) line 19 explicitly lists "A CI check that pins the lib floor (separate future issue)" as out-of-scope of cycle 0045.
- The RFC's Consequences section repeats this as "a separate, deferrable concern."
- Neither cycle 0045 nor any prior cycle filed a follow-up — this raw closes that loop.
- As more ES2023+ APIs land per the RFC's "add and ship" stance, the implicit typecheck signal weakens (more callers exist but the lib-lowering signal is still indirect).

## Acceptance

- A check exists that reads `tsconfig.json` and asserts both `compilerOptions.target` and `compilerOptions.lib` are `"ES2023"` (or a value drawn from an explicit allowlist documented inline).
- The check fails CI (non-zero exit) when the floor is lowered.
- The check runs in CI without requiring a separate workflow — wired as a `pretest:coverage` step or invoked from an existing CI job is acceptable.
- A regression test (or a passing run of the check itself) demonstrates it catches `target: "ES2022"` or `lib: ["ES2022"]` and passes on the current ES2023 config.
- RFC-002 line 19 is updated to remove the deferred bullet (or annotate it as resolved with a link to this cycle).

## Implementation sketch

A `node -e` one-liner or a small `scripts/check-tsconfig-floor.mjs` is sufficient:

```js
import { readFileSync } from "node:fs";
const tsconfig = JSON.parse(readFileSync("tsconfig.json", "utf8"));
const FLOOR = "ES2023";
const target = tsconfig.compilerOptions?.target;
const lib = tsconfig.compilerOptions?.lib;
if (target !== FLOOR) { console.error(`tsconfig target=${target}, expected ${FLOOR}`); process.exit(1); }
if (!Array.isArray(lib) || !lib.includes(FLOOR)) { console.error(`tsconfig lib=${JSON.stringify(lib)}, expected to include ${FLOOR}`); process.exit(1); }
```

Wire as:

- A `pretest:coverage` step in `package.json`, **or**
- A standalone npm script invoked by an existing CI job.

Keep the check tiny and dependency-free — this is a guard, not a framework.

## Non-goals

- Bumping the floor past ES2023 (out-of-scope for this cycle; RFC-002 governs floor changes).
- Generalizing the check to other tsconfig fields. One contract, one guard.
- Adding lint rules that detect ES2023 API usage in source. Typecheck already covers that direction; this guard covers the inverse (someone lowering the floor).
