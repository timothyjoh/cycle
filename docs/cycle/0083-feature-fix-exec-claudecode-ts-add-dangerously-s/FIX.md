Permission is hard-blocked — `skipAutoPermissionPrompt: true` in global settings means no UI prompt appears; settings.local.json absence of Edit/Write rules silently denies all writes. I cannot apply the fix from within this subprocess.

**The fix cannot be applied by this session.** Here is the complete picture for FIX.md and operator action:

---

## FIX.md — Cycle 0083 Fix Step Summary

**Task 1: Apply `--dangerously-skip-permissions` flag to `exec-claudecode.ts`**

**Status: ❌ Could not apply — permissions catch-22**

**Root cause:** This fix step runs as an engine subprocess launched via `claude -p <prompt>` (without `--dangerously-skip-permissions`). The project's `.claude/settings.local.json` lacks `Edit` and `Write` allow rules, and the global `settings.json` has `skipAutoPermissionPrompt: true`, which prevents interactive approval of writes. Every write attempt is silently blocked.

**The exact one-line change required:**

File: `src/engine/exec-claudecode.ts`, line 13

```diff
-      const child = spawn("claude", ["-p", prompt], {
+      const child = spawn("claude", ["--dangerously-skip-permissions", "-p", prompt], {
```

**Manual resolution — operator must choose one path:**

**Path A (recommended): Add write permissions to `.claude/settings.local.json`**
```json
{
  "permissions": {
    "allow": [
      "Edit(/Users/timothyjohnson/wrk/cycle/**)",
      "Write(/Users/timothyjohnson/wrk/cycle/**)",
      "Bash(git pull *)",
      "Bash(git push origin master*)",
      "Bash(git push origin master:master*)",
      "Bash(git push origin HEAD*)",
      "Bash(python3 -c \"import json; json.load\\(open\\('/Users/timothyjohnson/.claude/settings.json'\\)\\)\")",
      "Read(//Users/timothyjohnson/.claude/**)"
    ]
  }
}
```
Then re-run the fix step (or build step) — it will succeed.

**Path B: Apply the fix manually (fastest)**
```bash
cd /Users/timothyjohnson/wrk/cycle
# Edit line 13 of src/engine/exec-claudecode.ts:
# Change: spawn("claude", ["-p", prompt], {
# To:     spawn("claude", ["--dangerously-skip-permissions", "-p", prompt], {
npm test
npm run test:coverage
```

**Expected outcomes after fix:**
- `grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts` → line 13
- `npm test` passes (existing test at `tests/engine/exec-claudecode.test.ts:17-22` uses a fake `claude` binary that echoes args; test only asserts `/SPECCED/` — passes regardless of flag order)
- Coverage: unchanged from cycle 0082 baseline (line ≥95% / branch ≥75% / function ≥90%) — the change is purely a runtime arg, no new branches

**Tasks addressed:** 1 of 1 attempted, 0 completed due to permissions catch-22.
**Final test suite:** Not run — no code changes applied.
**Coverage:** Not measured — unchanged from BUILD.md baseline (≥95% line / ≥75% branch / ≥90% function).
**Tasks could not fix:** Task 1 — requires operator intervention to break the permissions bootstrapping loop.
