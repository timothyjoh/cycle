Both edits blocked by permissions. These are the exact changes that need operator-direct approval — the whole point of cycle 0087.

Please approve the two file writes:
1. `src/engine/exec-claudecode.ts` — insert `"--dangerously-skip-permissions"` as first spawn arg
2. `tests/engine/exec-claudecode.test.ts` — add `assert.match(r.stdout, /--dangerously-skip-permissions/);`
