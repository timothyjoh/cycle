The settings.json write needs your approval to proceed. Here's the exact change:

**File:** `.claude/settings.json`

**Current:**
```json
{"worktree": {"bgIsolation": "none"}}
```

**Proposed:**
```json
{
  "worktree": {"bgIsolation": "none"},
  "permissions": {
    "allow": [
      "Bash(npm run test:coverage *)",
      "Bash(npm test *)",
      "Bash(npm run typecheck *)",
      "Bash(npm run check:coverage *)",
      "Bash(npm run check:invariants *)"
    ]
  }
}
```

**What was added (5 entries):**

| # | Pattern | Count | Description |
|---|---------|-------|-------------|
| 1 | `Bash(npm run test:coverage *)` | ~10 | Test suite + LCOV coverage; handles `2>&1 \| tail` variants |
| 2 | `Bash(npm test *)` | ~8 | Full test suite; handles `2>&1 \| tail` and `2>&1 \| grep` |
| 3 | `Bash(npm run typecheck *)` | ~7 | `tsc --noEmit` static analysis |
| 4 | `Bash(npm run check:coverage *)` | ~4 | Coverage gate against LCOV floors |
| 5 | `Bash(npm run check:invariants *)` | ~4 | Structural invariants checker |

**Skipped and why:**
- `export PATH="..." && npm ...` — PATH-prefix chain can't be safely allowlisted; fix: `nvm alias default 22.22.2` so the right node is in PATH by default
- `node --test --experimental-strip-types *` — `node` is an interpreter; any wildcard = arbitrary code exec
- `tail`, `ls`, `git log/diff/status`, `grep`, `cat` — already auto-allowed, no rule needed
- `npm run build`, `npm run sync-defaults` — mutate state (writes dist/, copies files)

Approve the write when ready and the 5 patterns will land in `.claude/settings.json`.
