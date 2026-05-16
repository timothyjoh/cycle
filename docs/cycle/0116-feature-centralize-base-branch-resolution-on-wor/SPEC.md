SPEC written to `docs/cycle/0116-feature-centralize-base-branch-resolution-on-wor/SPEC.md`.

Key decisions captured:
- **`resolveBaseBranch`** lands in `src/engine/branch.ts` alongside `pullBase`/`checkoutBase`
- Priority: per-todo frontmatter `base_branch` → `wf.base_branch` → no silent `"main"` fallback
- `RunCycleOpts` gets an optional `baseBranch` field for the per-todo override path
- `CYCLE_BASE` env var kept as debug escape hatch only, not primary resolution
- `WorkflowConfig.base_branch` already required (`string`, not optional) — no type change needed
