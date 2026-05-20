`★ Insight ─────────────────────────────────────`
This cycle is pure prompt editing — no TypeScript, no new tests required. The only execution risk is sync-defaults divergence guard: if `.cycle/prompts/documentation.md` was locally modified since last sync, the script exits 2 and skips it. The sha256 state in `.cycle/.sync-state.json` governs this — the planner should note that `--force` is available if the guard fires.
`─────────────────────────────────────────────────`

RESEARCH.md written. Key findings:

- **Insertion point**: `src/defaults/prompts/documentation.md:8–17`, `## Inputs to read` section — add `REFLECTION.md` bullet with `(may be absent)` qualifier (same pattern as `FIX.md`)
- **Both files identical now**: source and deployed copies are in sync; `sync-defaults` will propagate cleanly
- **No prompt content tests**: existing tests pin step ordering and engine behavior but none assert `documentation.md` content — no test changes required
- **One open question for the planner**: whether extraction guidance lives in the bullet itself or as a new paragraph in `## What to edit`
