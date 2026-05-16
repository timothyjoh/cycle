---
id: refl-0087-build-and-fix-steps-accept-permissions-r
source: reflection
title: build and fix steps accept permissions-request prose as successful output
added_at: "2026-05-16T03:02:38.462Z"
triage_attempts: 0
priority_hint: 8
origin_cycle_id: "0087"
---

In cycles 0083–0087, the build and fix agents were blocked by `settings.local.json` write restrictions. Instead of failing, they wrote human-readable permission-approval requests to BUILD.md / FIX.md and exited 0. The engine recorded `step.end status:ok` and the cycle proceeded to verify, commit, and drain as done.

This is a variant of the empty-diff guard gap (multiple prior refl issues filed) specific to the permissions catch-22: the agent cannot apply edits, writes prose instead, exits 0, and the cycle succeeds. No diff guard catches it because the artifact dir gains new files (BUILD.md, FIX.md) even though source files are unchanged.

The verify step (`scripts/verify.sh` or equivalent) should include a check that at least one non-artifact source file was modified relative to the base commit. If `git diff --name-only` shows only `docs/cycle/` paths, the verify step should exit non-zero.
