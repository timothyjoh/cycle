Needs write permission. Please approve and I'll retry. The plan covers:

**3 test files, same idiom each:**

| File | Line | Change |
|---|---|---|
| `tests/engine/exec-codex.test.ts:8` | stub `cat` → `head -c 33`, `assert.equal(r.stdout, body)`, `{ timeout: 2000 }` |
| `tests/engine/exec-gemini.test.ts:8` | stub `cat` → `head -c 34`, `assert.equal(r.stdout, body)`, `{ timeout: 2000 }` |
| `tests/engine/exec-spawn.test.ts:35` | extract `body` var, stub `cat` → `head -c 12`, `assert.equal(r.stdout, body)`, `{ timeout: 2000 }` |

`stdin.end()` lives in `src/engine/exec-spawn.ts` (shared helper from cycle 0162), so all three tests catch the same regression point. The acceptance check: delete `stdin.end()`, run `npm test`, tests fail fast (equality mismatch or 2s timeout) instead of hanging.
