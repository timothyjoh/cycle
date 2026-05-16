SPEC written to `docs/cycle/0113-feature-consolidate-terminal-failure-file-move-f/SPEC.md`.

Scope: extract `terminalDrain` from `cli.ts` → `src/engine/issue-lifecycle.ts`, wire the import back, add `tests/engine/issue-lifecycle.test.ts` covering the happy path and the `mutateFrontmatter` fallback. No behavior changes — pure extraction.
