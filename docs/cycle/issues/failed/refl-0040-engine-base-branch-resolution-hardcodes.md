---
id: refl-0040-engine-base-branch-resolution-hardcodes
title: Centralize base-branch resolution on workflow `base_branch` (stop hardcoding `main`)
workflow: feature
depends_on: []
triaged_at: "2026-05-14T03:41:13.238Z"
source: triage
failed_at: "2026-05-18T20:09:58.521Z"
failed_attempts: 3
last_cycle_id: "0153"
---
## Problem

Across cycles 0036/0037/0038, `cycle.checkout` and `cycle.base_pull` events emit `base: "main"` despite `.cycle/workflows.yml` declaring `master`. In cycle 0038 this surfaced as:

```
git checkout main failed: pathspec 'main' did not match any file(s) known to git
```

The post-`pr` checkout died and the failure re-surfaced at 0040 startup as `engine.warning {reason: resume_base_refresh_failed}`. Cycle 0040's BUILD.md explicitly flagged this `main`-vs-`master` engine bug as a remaining follow-up.

The engine's post-cycle checkout / resume base-refresh path is not reading the workflow's declared `base_branch` (or the per-todo frontmatter `base_branch` override) — it falls back to a hardcoded `main`. Until fixed, any local fork using `master` (this repo, dogfooded) hits the same warning every `engine.start` and loses the post-cycle base-pull.

## Scope

1. **Trace every base-source read** and confirm what each path uses today:
   - `src/engine/run-cycle.ts` — post-cycle checkout / `cycle.base_pull` emission.
   - `src/cli.ts` — resume base-refresh (`git fetch` + ff merge at engine.start when resuming an in-flight cycle).
   - `src/engine/branch.ts` — `pullBase` helper.
   - Any other call site that names `main` as a literal.
2. **Centralize resolution** on the workflow's `base_branch` (declared in `.cycle/workflows.yml`), with per-todo frontmatter `base_branch` override taking precedence. Define a single helper (e.g. `resolveBaseBranch(workflow, todoFrontmatter)`) and route every call site through it. Delete the `main` fallback or replace it with an explicit error so silent drift is impossible.
3. **Decide fallback semantics**: if neither workflow nor frontmatter declares `base_branch`, what happens? Options: (a) throw, (b) detect the repo's default branch via `git symbolic-ref refs/remotes/origin/HEAD`, (c) leave the literal `main`. Pick one and document it; do not preserve the silent literal.

## Acceptance

- No hardcoded `"main"` string remains in `src/engine/` or `src/cli.ts` outside of test fixtures / docs / the chosen fallback (which must be explicit and centralized in one place).
- A regression test using a `master`-only synthetic fixture (workflows.yml with `base_branch: master`, no `main` branch in the repo) asserts:
  - `cycle.checkout.base === "master"`
  - `cycle.base_pull.base === "master"` (when emitted)
  - Engine `cli.ts` resume-base-refresh fetches/merges `master`, not `main`.
  - No `engine.warning {reason: "resume_base_refresh_failed"}` emitted on a clean resume.
- Per-todo frontmatter `base_branch` override path is exercised by at least one test (workflow says `master`, todo frontmatter says `release-x`, observe `release-x` checked out).
- Coverage does not regress against the master baseline (line ≥ 95%, branch ≥ 75%, func ≥ 90%).

## Pointers

- Origin reflection: `docs/cycle/issues/raw/refl-0040-engine-base-branch-resolution-hardcodes.md`.
- Companion cycle 0040 reflections: `refl-0040-createcyclebranch-reuse-path-uncovered-l` (separate child), `refl-0040-findpriorbuildheadsha-multi-row-bottom-u`, `refl-0040-orphaned-cycle-branches-from-aborted-run`.
- Workflow YAML shape: `.cycle/workflows.yml` (local) vs `src/defaults/workflows.yml` (shipped default). After any change to `src/defaults/`, run `npm run sync-defaults`.
- Resume mechanics: `src/engine/log-tail.ts` + `cli.ts` resume path (engine.resume vs cycle.start fork).
- Subprocess discipline: spawn with array args; no `shell: true`.
