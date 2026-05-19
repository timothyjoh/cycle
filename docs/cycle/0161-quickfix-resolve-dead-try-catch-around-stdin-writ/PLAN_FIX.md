`★ Insight ─────────────────────────────────────`
The unreachable catch dragged per-file function coverage below the 90% floor because the catch clause body counts as a distinct branch/function path the coverage tool cannot exercise. Dead error guards are often hidden coverage sinkholes — removing them improves both coverage and signal fidelity simultaneously.
`─────────────────────────────────────────────────`

Plan written to `docs/cycle/0161-quickfix-resolve-dead-try-catch-around-stdin-writ/PLAN.md`.

**Fix:** delete `try/catch` at `src/engine/exec-codex.ts:39-44`, leave the two `stdin` calls as bare statements. **Verification:** existing ENOENT test passes + per-file function coverage for that file rises to ≥ 90%.
