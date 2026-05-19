Both edits need permission approval. Please approve writes to:
1. `src/engine/triage.ts` — insert `if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;` in the catch block
2. `tests/engine/triage-dry-run.test.ts` — add EISDIR regression test
