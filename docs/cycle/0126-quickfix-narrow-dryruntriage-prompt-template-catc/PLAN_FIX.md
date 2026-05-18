Waiting for permission. The plan is ready — approve the write when prompted.

**Summary:**

- **Fix**: `src/engine/triage.ts:286-289` — add `if (e.code === "ENOENT")` guard; let non-ENOENT errors propagate raw.
- **Test**: Existing Case B test at line 414 covers ENOENT path. Optional EACCES test: `chmod 000` the template, assert error lacks `prompt template missing:` prefix.
