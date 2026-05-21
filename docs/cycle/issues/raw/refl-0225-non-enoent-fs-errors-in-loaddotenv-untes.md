---
id: refl-0225-non-enoent-fs-errors-in-loaddotenv-untes
source: reflection
title: non-ENOENT fs errors in loadDotEnv untested — crash engine raw at bootstrap
added_at: "2026-05-21T13:11:24.556Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0225"
---

`src/engine/dot-env.ts:9` re-throws any error whose `.code` is not `ENOENT` (e.g. `EACCES`, `EISDIR`). This branch is never exercised by the test suite: all tests either use a missing file (ENOENT) or a successfully readable file. The `throw e` path runs zero times, meaning a permission-denied or directory-collision on `.cycle/.env` crashes the engine at bootstrap with a raw Node.js stack trace before any user-facing error handling runs.

Branch coverage reflects this gap (92.44% overall; dot-env.ts line coverage is 100% but branch coverage is not). A future change to the catch block would not be caught by tests.

Suggested fix: add a test that uses `chmodSync(filePath, 0o000)` (or stubs `readFileSync`) to verify non-ENOENT errors propagate. Optionally wrap the throw with a user-friendly message before re-throwing.
