# cycle

An engine that turns issues into code changes — invoked by another agent or CI, runs one or more workflow cycles per issue, and lands branches and PRs.

## Cycle behavior

- `commit.sh` selectively stages the cycle's intended change surface (honors a hard denylist for `.claude`, `dist`, `node_modules`, `*.lock`, and submodule gitlinks).
- `pr.sh` opens the PR with `--squash --auto` and falls back to a synchronous squash merge when the repo has auto-merge disabled, deleting the orphaned remote branch afterward.
- `commit.sh` and `pr.sh` append `Closes #N` lines for any `https://github.com/<owner>/<repo>/issues/<N>` URL found in the cycle's issue body, scoped to the current repo, so merged PRs auto-close the referenced issues.
