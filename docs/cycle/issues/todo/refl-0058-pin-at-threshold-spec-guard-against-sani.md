---
id: refl-0058-pin-at-threshold-spec-guard-against-sani
title: Decouple at-threshold spec-guard regression test from sanitizer trailing-newline append
workflow: feature
depends_on: []
triaged_at: "2026-05-14T21:07:45.923Z"
source: triage
---
## Problem

The at-threshold spec-guard regression test at `tests/engine/run-cycle.spec-guard.test.ts:135-167` constructs an exactly-`SPEC_MIN_BYTES` (200-byte) payload by emitting 199 `x` characters from the fake `claude` stub and relying on `sanitizeArtifactStdout`'s `s === "" ? "" : s + "\n"` trailing-newline append at `src/engine/sanitize-artifact.ts:17` to bring the on-disk payload up to exactly 200 bytes.

REVIEW.md (cycle 0058, Findings 3) flagged this directly: if that trailing-newline behavior ever changes (preserve-existing-newline-or-add, conditional on payload shape, dropped entirely), the at-threshold test silently shifts to 199 bytes, falls below the guard, and starts failing — but the failure looks like a real spec-guard regression rather than a stale test fixture.

## Why it matters

The spec-guard tests are the single source of truth pinning the `<` boundary at `src/engine/run-cycle.ts:158`. Any cross-module coupling the tests rely on but don't pin is a future false-positive waiting to happen. The two surfaces (`sanitize-artifact.ts`, `run-cycle.ts` guard) are intentionally separable — a future sanitizer refactor should not drag the spec-guard suite down.

## Direction

Prefer **option (a)**: make the at-threshold test explicitly write a 200-byte body from the fake-`claude` stub (e.g. `printf '%.0sx' $(seq 1 199); echo` produces 199 x's + literal newline = 200 bytes), removing the dependency on the sanitizer's append entirely. Decouples cleanly.

Fallback **option (b)**: add a one-line code comment in the test next to the 199-byte construction noting the dependency on `sanitize-artifact.ts:17` and instructing future editors to re-verify if that line moves. At least makes the coupling discoverable.

## Acceptance

- At-threshold spec-guard test no longer depends on `sanitizeArtifactStdout`'s trailing-newline append for its 200-byte target (option a), OR carries an explicit pinning comment citing `sanitize-artifact.ts:17` (option b).
- Test continues to pin: payload of exactly `SPEC_MIN_BYTES` passes the guard (boundary is strict `<`).
- Full test suite passes; coverage holds at master baseline.
- If option (a): a complementary one-line comment in `sanitize-artifact.ts:17` is fine but not required — the test self-contains its byte arithmetic.

## Out of scope

- Changing `SPEC_MIN_BYTES` value.
- Changing the `<` vs `<=` boundary in the guard.
- Refactoring `sanitizeArtifactStdout`'s trailing-newline behavior (separate concern — see `refl-0055-sanitizer-narration-regex-too-narrow-sti-trailing-narration-strip`).
