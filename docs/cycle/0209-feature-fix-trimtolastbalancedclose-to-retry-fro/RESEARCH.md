`RESEARCH.md` written to `docs/cycle/0209-feature-fix-trimtolastbalancedclose-to-retry-fro/RESEARCH.md`.

Key findings for the planner:

- `trimToLastBalancedClose` is **file-private in `reflection.ts:147`**, not in `log-fmt.ts` (issue file was wrong about location)
- `parseWithRepair` (line 132) does a single repair attempt — needs a retry loop
- Two fence-strip paths exist: `ingestReflection`'s own `FENCE_RE` at line 37-39 (anchored, json-only), and `stripFences` inside `parseWithRepair` (wider, handles leading prose) — the retry loop only activates when both are no-ops
- The main open question: whether `trimToLastBalancedClose` should return `{ result, start }` to tell the loop where the current brace was (so it can advance past it), or the loop re-scans independently
