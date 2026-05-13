# Cycle MVP Dogfood — 2026-05-12

Cycle 0001 ran the `feature` workflow against the cycle repo itself
and produced a merged PR. End-to-end loop works.

- **Task:** "add a one-line README.md to the cycle repo describing what cycle is"
- **Cycle ID:** `0001`
- **PR:** https://github.com/timothyjoh/cycle/pull/2 (merged 2026-05-12T22:30:33Z)
- **Resulting file:** `README.md` (committed by cycle 0001)

## Run timeline

| Step | Duration | Outcome |
|---|---|---|
| `engine.start` → `cycle.start` | <1s | OK |
| `spec` (claudecode) | 21s | OK — wrote `SPEC.md` |
| `research` (claudecode) | 21s | OK — wrote `RESEARCH.md` |
| `plan` (claudecode) | 34s | OK — wrote `PLAN.md` |
| `build` (claudecode) | 27s | OK — created `README.md`, wrote `BUILD.md` |
| `verify` (bash → `npm test`) | <1s | **FAILED** (exit 9) |

Total claudecode time: ~103s. Verify failed before the engine reached
`commit` and `pr`.

## What worked

- Invocation pattern `./.cycle/bin/cycle.js run "<text>"` correctly
  materialized the freeform task into `docs/cycle/issues/tbd/`,
  scanned it to `queued/`, and started the cycle.
- JSONL event stream (`.cycle/log.jsonl`) gave full visibility into
  every step start/end and the failure point. Made manual recovery
  trivial.
- `cycle.start` event correctly allocated cycle ID `0001` and recorded
  workflow + title + issue_id.
- All four claudecode steps produced sensible artifacts. The agent
  followed the prompt structure (output-to-stdout) and the engine
  wrote each step's output to `<STEPNAME>.md` in the cycle's artifact
  directory.
- `git checkout -b cycle/feature/<slug>` from `master` worked cleanly.
- The artifact dir (`docs/cycle/0001-feature-add-a-one-line-readme-md-to-the-cycle-re/`)
  contained the full paper trail: SPEC.md, RESEARCH.md, PLAN.md, BUILD.md.

## What broke

### 1. `verify` failed — `npm test` exit 9, missing `node_modules`

The cycle repo's tests need `node_modules` (yaml, esbuild,
typescript, etc.). After `git checkout` to the cycle branch from a
master that had never run `npm install`, only committed files
existed; `node --test` failed.

**Mitigation in MVP scope:** run `npm install` once in the consuming
repo before invoking cycle. **Follow-up fix:** `verify.sh` should
detect a missing `node_modules` and either `npm ci` or fail with a
clearer message.

### 2. Auto-merge wasn't allowed on the GitHub repo

`gh pr merge <n> --squash --auto` returned
`GraphQL: Auto merge is not allowed for this repository (enablePullRequestAutoMerge)`.
Auto-merge is a repo setting that needs to be enabled in
`Settings → General → Pull Requests`.

**Mitigation:** enabled before next run, or fall back to immediate
merge (no `--auto`).

### 3. `commit.sh` over-staged via `git add -A`

The commit grabbed two unintended things along with the README:
- `.claude/scheduled_tasks.lock` (transient cron lock file)
- `.claude/worktrees/{install-invoke-monitor-decisions,mvp-build-plan}`
  (worktree gitlinks)

**Follow-up fix:** `commit.sh` should respect a stricter staging
policy. Either use `git add --intent-to-add` + commit only files that
match the cycle's expected change surface, or add common transients
to `.gitignore` defaults that `cycle init` ships.

**Resolved in cycle 0005 (GH #4).**

### 4. No engine-side recovery after a step failure

When `verify` failed, the engine emitted `cycle.end status=failed` and
exited — no automatic retry, no commit, no PR. This is by design for
MVP (3-attempt abandon-and-restart is BRIEF Phase 4 / deferred from
this plan). Manual recovery was easy thanks to the structured artifact
dir + JSONL log:

```bash
npm install                                # fix the verify env
npm test                                   # confirm 26/26 pass
git add README.md docs/cycle/0001-*/ ...   # stage what cycle would have
CYCLE_ID=0001 CYCLE_TITLE="..." bash .cycle/scripts/commit.sh
CYCLE_BASE=master CYCLE_ID=0001 ... bash .cycle/scripts/pr.sh
gh pr merge 2 --squash --delete-branch     # workaround for disabled auto-merge
```

The salvage path took ~30 seconds. Each manual step mapped 1:1 to a
cycle workflow step.

### 5. Test ordering coupling

`tests/build.test.ts` produces `dist/cycle.js` as a side effect (it
shells out to `npm run build`). `tests/cli/init.test.ts` then expects
`dist/cycle.js` to exist. If init's test runs first, it fails.

**Follow-up fix:** explicitly build before test in `npm test` (chain
`npm run build && node --test ...`), or have `init.test.ts` build its
own bundle, or split build out into `npm run smoke` integration.

## Cycle output (README.md, verbatim)

```
# cycle

An engine that turns issues into code changes — invoked by another agent or CI, runs one or more workflow cycles per issue, and lands branches and PRs.
```

## Next plans (post-dogfood)

These BRIEF.md sections deserve their own follow-up plans in
`docs/plans/`:

1. **Verify resilience.** Pre-flight `npm install` in `verify.sh`;
   make `commit.sh` selective; ship `.gitignore` defaults via init.
2. **Branch protection / auto-merge handling.** Detect when
   auto-merge isn't available and fall back gracefully; document
   required repo settings.
3. **Cycle attempts** (BRIEF Phase 4 MVP line). 3-attempt
   abandon-and-restart with fresh branches and wiped artifacts; the
   `verify` failure above is exactly what this is meant to absorb.
4. **`--detach` daemon + `attach` / `status` / `stop`.** Long-running
   queues shouldn't pin a foreground terminal or a Claude Code
   session.
5. **Triage + multi-cycle decomposition.** Currently forced to
   `--workflow feature`; needed for big issues that split.
6. **Tracker fetch scripts** (`--issue JIRA-123` →
   `.cycle/scripts/fetch-issue.sh`).
