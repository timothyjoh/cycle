---
id: refl-0058-pin-at-threshold-spec-guard-against-sani
source: reflection
title: pin-at-threshold-spec-guard-against-sanitizer-trailing-newline-coupling
added_at: "2026-05-14T21:03:59.400Z"
triage_attempts: 0
priority_hint: 3
origin_cycle_id: "0058"
---

The at-threshold spec-guard regression test at `tests/engine/run-cycle.spec-guard.test.ts:135-167` constructs an exactly-`SPEC_MIN_BYTES` (200-byte) payload by emitting 199 `x` characters from the fake `claude` stub and relying on `sanitizeArtifactStdout`'s `s === "" ? "" : s + "\n"` trailing-newline append at `src/engine/sanitize-artifact.ts:17` to bring the on-disk payload up to exactly 200 bytes. REVIEW.md flagged this directly (`### Findings 3`): if that trailing-newline behavior ever changes (preserve-existing-newline-or-add, conditional on payload shape, dropped entirely), the at-threshold test silently shifts to 199 bytes, falls below the guard, and starts failing — but the failure would look like a real spec-guard regression rather than a stale test fixture.

Why it matters: the spec-guard tests are the single source of truth pinning the `<` boundary in `src/engine/run-cycle.ts:158`. Any cross-module coupling that the tests rely on but don't pin is a future false-positive waiting to happen. The two surfaces (`sanitize-artifact.ts`, `run-cycle.ts` guard) are intentionally separable, so a future sanitizer refactor shouldn't drag the spec-guard suite down.

Direction: either (a) make the at-threshold test explicitly write a 200-byte body in the stub (e.g. `printf '%.0sx' $(seq 1 199); echo` produces 199 x's + literal newline = 200 bytes, removing the dependency on the sanitizer's append), or (b) add a 1-line code comment in the test next to the 199-byte construction noting the dependency on `sanitize-artifact.ts:17` and instructing future editors to re-verify if that line moves. Option (a) is cheaper and decouples cleanly; option (b) at least makes the coupling discoverable.
