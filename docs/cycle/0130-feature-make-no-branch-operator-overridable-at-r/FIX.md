All 6 tasks resolved. Summary:

**467 tests pass (0 fail), coverage 98.36% line / 92.17% branch / 95.77% function — no regression.**

Changes applied:

| What | Where |
|---|---|
| `CYCLE_TRUNK_BASED=1` env var override | `src/engine/workflow.ts` — 3 lines before `parsed.engine.commit` assignment |
| `--trunk` CLI flag | `src/cli/parse-args.ts` — `RunArgs` + options parser |
| Env var stamp before `loadConfig` | `src/cli.ts` — `if (args.trunk) process.env.CYCLE_TRUNK_BASED = "1"` |
| YAML files byte-identical | `src/defaults/workflows.yml` + `.cycle/workflows.yml` — `mode: worktree-pr`, `document` workflow, header comment |
| `.cycle/.env` | `CYCLE_TRUNK_BASED=1` — dogfood repo stays trunk-based without YAML divergence |
| CLAUDE.md | "Workflow style" bullet documents env var + `--trunk` + `.cycle/.env` persistence |
| Tests | 3 workflow env var tests + 2 parse-args trunk tests + dogfood mode assertion updated |
| PLAN.md | SPEC Acceptance Traceability table appended |
| MUST-FIX.md | All 6 tasks marked complete |
