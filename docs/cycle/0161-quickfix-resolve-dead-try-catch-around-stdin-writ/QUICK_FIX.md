Typecheck clean.

Deleted the dead `try/catch` block in `src/engine/exec-codex.ts` lines 39–44. The `child.stdin.on("error", () => {})` listener on line 38 already suppresses EPIPE-class errors, and the `child.on("error", ...)` handler owns resolution for ENOENT, so the catch block was unreachable. Both `child.stdin.write(prompt)` and `child.stdin.end()` are now bare statements immediately following the error listener, matching the pattern the PLAN.md specifies.
