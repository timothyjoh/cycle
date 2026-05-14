# Must-Fix Items: Cycle 0058

## Summary
0 critical issues, 1 minor issue found in review. The spec-guard
implementation is correct and all SPEC §Acceptance bullets are
satisfied. One SPEC §Requirements clause — "byte count is measured on
the **post-sanitization** payload" — is not directly exercised by the
regression test suite. Adding one small scenario pins that contract so
a future regression that swaps `sanitized` for `r.stdout` is caught.

## Tasks

- [x] ### Task 1: Add sanitization-induced under-threshold regression
  **Status:** ✅ Fixed
  **What was done:** Added `spec-guard [branch]: raw>=200 but sanitized<200 still fails` test in `tests/engine/run-cycle.spec-guard.test.ts` (single scenario, scope-local to `noBranch=false` per MUST-FIX guidance). Stub `claude` emits 10 × ~39-byte narration lines (`Now I will write the spec for cycle X.`, ~390 bytes raw) which `sanitizeArtifactStdout` strips entirely; on-disk SPEC.md is `""` (0 bytes < 200). Asserts `r.status === "failed"`, `failingStep === "spec"`, the matching `step.end`/`cycle.end` log entries, absence of `research` `step.start`, and `specMd === ""`. Contract-pin sanity check passed: temporarily mutating `Buffer.byteLength(sanitized, …)` → `Buffer.byteLength(r.stdout, …)` at run-cycle.ts:157 made the new test fail (raw 390 ≥ 200, guard would not fire); reverted.

  **Priority:** Minor
  **Files:** `tests/engine/run-cycle.spec-guard.test.ts`
  **Problem:** SPEC §Requirements explicitly states:

  > Byte count is measured on the **post-sanitization** payload (the
  > string returned by `sanitizeArtifactStdout(r.stdout)`), not raw
  > stdout. Sanitization strips narration / fences, so a "200 bytes of
  > `Now I will write the spec…`" stdout that sanitizes to under-
  > threshold must still fail.

  The current test suite only feeds the stub `claude` binary plain
  text ("xxx…"), which sanitizes to a near-identical byte count. No
  test verifies the post-sanitization measurement property. A future
  regression that changes
  `Buffer.byteLength(sanitized, "utf8")` →
  `Buffer.byteLength(r.stdout, "utf8")` at
  `src/engine/run-cycle.ts:157` would slip through every existing
  spec-guard test.

  **Fix:** Add one scenario to
  `tests/engine/run-cycle.spec-guard.test.ts` (no parameterization
  required — a single test on either `noBranch=false` or
  `noBranch=true` is sufficient since the sanitization path is
  workflow-shape-agnostic). The stub `claude` binary emits a payload
  whose raw byte count is >= `SPEC_MIN_BYTES` (≥ 200 bytes) but
  whose post-sanitization byte count is < `SPEC_MIN_BYTES`.

  Cheapest construction: a narration-only payload that `sanitizeArtifactStdout`
  strips to empty. Example shell body:

  ```sh
  #!/bin/bash
  # Raw stdout: ~250 bytes of repeated narration prefix lines.
  # sanitizeArtifactStdout strips all leading "Now|Next|Here is|Output" lines,
  # leaving the empty string -> 0 bytes post-sanitization.
  for i in $(seq 1 10); do echo "Now I will write the spec for cycle X."; done
  ```

  That payload's raw byte count is ~390 bytes (10 × ~39 chars), and
  `sanitizeArtifactStdout` strips every line as narration, returning
  `""` — well under `SPEC_MIN_BYTES`.

  The test asserts:
  - `r.status === "failed"` and `r.failingStep === "spec"`.
  - Same log regex matches as the existing under-threshold case:
    `step.end status:"failed"`, `cycle.end status:"failed"
    failing_step:"spec"`, no `research` `step.start`.
  - The on-disk `SPEC.md` content equals the sanitized payload
    (empty string after sanitization), proving the measurement +
    write both run on the post-sanitization string.

  Suggested skeleton (drop in near the existing for-loop, scope-local
  to `noBranch=false` for terseness):

  ```ts
  test("spec-guard [branch]: raw>=200 but sanitized<200 still fails", async () => {
    const fakeBody = `#!/bin/bash
  for i in $(seq 1 10); do echo "Now I will write the spec for cycle X."; done
  `;
    const { root, bin } = await setupRepo(false, fakeBody);
    try {
      const r = await runCycle(root, {
        issueId: "SG-SANITIZE",
        title: "spec guard sanitize",
        workflow: "feature",
        env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
      });
      assert.equal(r.status, "failed");
      assert.equal(r.status === "failed" ? r.failingStep : null, "spec");

      const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
      assert.match(
        log,
        /"event":"step\.end","cycle_id":"\d+","step":"spec","status":"failed","exit_code":1/,
      );
      assert.match(
        log,
        /"event":"cycle\.end","cycle_id":"\d+","status":"failed","failing_step":"spec"/,
      );

      const artifactDir = join(root, "docs/cycle", `${r.cycleId}-feature-spec-guard-sanitize`);
      const specMd = await readFile(join(artifactDir, "SPEC.md"), "utf8");
      // Sanitizer strips every "Now …" line, leaving empty -> "" written verbatim.
      assert.equal(specMd, "");
      assert.ok(Buffer.byteLength(specMd, "utf8") < SPEC_MIN_BYTES);
    } finally {
      await cleanup(root, bin);
    }
  });
  ```

  **Verify:**
  - `node --test --experimental-strip-types tests/engine/run-cycle.spec-guard.test.ts`
    passes the new scenario + the existing 8.
  - Sanity-check the contract pin: temporarily edit
    `src/engine/run-cycle.ts:157` to
    `const bytes = Buffer.byteLength(r.stdout, "utf8");` and confirm
    the new test fails (raw ~390 bytes is >= 200, so the guard would
    not fire). Revert.
  - `npm test` still 390/390.
  - `npm run test:coverage` aggregates stay green and the per-file
    `triage.ts ≥ 95%` gate is untouched.
