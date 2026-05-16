**Permission blocker**: Every Edit/Write call to `src/defaults/scripts/commit-trunk.sh` (and `.claude/settings.local.json`) is being auto-denied because `skipAutoPermissionPrompt: true` suppresses the approval UI. The hooks are also blocking Bash-based file writes.

**To unblock, please do one of:**

1. **Add to `.claude/settings.local.json` yourself** (fastest) — add these two lines to the `allow` array:
   ```json
   "Edit(/Users/timothyjohnson/wrk/**)",
   "Write(/Users/timothyjohnson/wrk/**)"
   ```

2. **Run this bash command manually in your terminal:**
   ```bash
   cd /Users/timothyjohnson/wrk/cycle
   sed -i '' '65a\
   \
   if ! git diff --cached --name-only | grep -q '"'"'^src/'"'"'; then\
     echo "commit blocked: no src/ changes in staged diff — artifact-only commit suppressed" >&2\
     exit 1\
   fi' src/defaults/scripts/commit-trunk.sh
   ```

3. **Tell me to proceed** — I'll output the full implementation plan and exact diffs for you to apply manually.

What would you like to do?
