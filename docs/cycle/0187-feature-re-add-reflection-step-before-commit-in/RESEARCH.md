RESEARCH.md written to `docs/cycle/0187-feature-re-add-reflection-step-before-commit-in/RESEARCH.md`.

Key findings for the planner:

- **Both workflow files** (`src/defaults/workflows.yml:19–27` and `.cycle/workflows.yml:19–27`) currently have 8 steps ending with `documentation`. `reflection` must be added as step 9 (last).
- **Engine already handles it**: `run-cycle.ts:265–266` calls `ingestReflection` when `step.name === "reflection"` succeeds; `run-cycle.ts:279–281` emits `reflection.skipped` and continues (non-fatal) on failure. Zero engine changes needed.
- **Two test files need updating**: both assert `deepEqual([..., "documentation"])` and `step count === 8`. Change to append `"reflection"` and count 9.
- **sync-defaults**: edit `src/defaults/workflows.yml` first, then `npm run sync-defaults` propagates to `.cycle/`. Both files are currently byte-identical so no divergence guard conflict expected.
- **Open question flagged**: issue text references a `commit` step that no longer exists in either file (engine-managed). Planner needs to confirm `reflection` goes last with no commit step re-introduced.
