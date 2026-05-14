# RFC-002: TypeScript ES2023 floor

**Status:** Accepted (2026-05-14). Scope: contributor-facing project conventions (typecheck floor); no user-facing API change.

---

## Context

Cycle 0019 ([BUILD.md](cycle/0019-feature-cli-cycle-drop-writes-to-raw-not-tbd/BUILD.md), [REVIEW.md](cycle/0019-feature-cli-cycle-drop-writes-to-raw-not-tbd/REVIEW.md)) bumped `tsconfig.json` from `target: ES2022` (no `lib`) to `target: ES2023` / `lib: ["ES2023"]` to resolve pre-existing `findLast` typecheck errors at `tests/cli/multi-loop.test.ts:53,114`. The bump was flagged as "scope creep (acceptable, doc-noted)" in cycle 0019's REVIEW but never formalized as a project decision, so the next contributor reaching for an ES2023 method (or considering downgrading `lib`) has no single rationale to consult.

## Decision

The project's TypeScript floor is **ES2023** for both `target` and `lib` in `tsconfig.json`. ES2023 array prototypes (`findLast`, `findLastIndex`, `toSorted`, `toReversed`, `with`) and ES2023 grammar (Hashbang) are first-class and require no polyfills. Node 22.6 — already the runtime floor (see [../CLAUDE.md](../CLAUDE.md) `## Runtime`) — natively implements all ES2023 features, so the typecheck floor matches the runtime floor.

## Consequences

- The Node 22.6 floor is now load-bearing for *type-checking*, not just runtime. Downgrading `lib` below ES2023 requires either a coordinated Node downgrade or polyfills.
- Future ES2023+ stdlib usage (`Array.prototype.toSorted`, `Object.groupBy`, etc.) needs no further decision — add and ship.
- A CI check that pins the lib floor is a separate, deferrable concern (a regression would already trip `npm run typecheck` because of the existing `findLast` callers at `tests/cli/multi-loop.test.ts:53,114`).
- This RFC is the canonical citation when reviewing PRs that propose touching `tsconfig.json` `target` or `lib`.
