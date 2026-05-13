# cycle

An engine that turns issues into code changes — invoked by another agent or CI, runs one or more workflow cycles per issue, and lands branches and PRs.

## Cycle behavior

- `commit.sh` selectively stages the cycle's intended change surface (honors a hard denylist for `.claude`, `dist`, `node_modules`, `*.lock`, and submodule gitlinks).
- `pr.sh` opens the PR with `--squash --auto` and falls back to a synchronous squash merge when the repo has auto-merge disabled, deleting the orphaned remote branch afterward.
- `commit.sh` and `pr.sh` append `Closes #N` lines for any `https://github.com/<owner>/<repo>/issues/<N>` URL found in the cycle's issue body, scoped to the current repo, so merged PRs auto-close the referenced issues.

## Recovering from engine.paused

When every raw issue fails triage in a single pass, the engine emits `engine.paused {reason: "all_triage_failed", raw_ids, last_errors}`, moves each failed raw to `docs/cycle/issues/failed/<id>.md` with `failed_step: "triage"` stamped into its frontmatter, and exits non-zero. `tbd.jsonl` is untouched and no cycle was started, so the work queue is intact and the engine is safe to re-fire once the underlying problem is fixed.

### Payload

```jsonc
{
  "reason": "all_triage_failed",
  "raw_ids": ["<id>", "..."],
  "last_errors": [{ "raw_id": "<id>", "error": "<≤2000 chars, head-kept>" }]
}
```

Each `error` is capped at 2000 chars (head-kept; trailing `…` on overflow), so a runaway agent stdout still produces a bounded payload.

### 1. Inspect the pause event and the failed raws

Tail the audit log to read the structured failure:

```sh
tail -n1 .cycle/log.jsonl | jq 'select(.event == "engine.paused")'
```

The `raw_ids` array lists every raw that was attempted; `last_errors` carries the validator (or agent) error from each raw's final retry. The corresponding files are now under `failed/`:

```sh
ls docs/cycle/issues/failed/
```

Raws stamped with `failed_step: triage` in their frontmatter are the ones the paused pass moved (alongside `failed_at` and `triage_attempts: 3`). Note: the audit log also contains one `triage.raw.failed` event per attempt per raw preceding the final `engine.paused`.

Most pauses point at one of:

- A broken triage prompt (validator rejects every output → fix `src/defaults/prompts/triage.md` or the configured triage prompt).
- An upstream API outage (every call failed identically → wait and re-fire).
- A batch of malformed raw issues (each raw has a distinct error → edit or delete them).

### 2. Iterate with `cycle triage --dry-run`

`cycle triage --dry-run` only scans `docs/cycle/issues/raw/`. To re-test a failed raw, move it back into `raw/` first:

```sh
mv docs/cycle/issues/failed/<id>.md docs/cycle/issues/raw/<id>.md
# ...edit the file or the prompt...
cycle triage --dry-run
```

Output is `Array<{raw_id, status, attempts, last_error?, children?}>` printed as JSON to stdout. Exit code is `0` if every raw passes validation, `1` if any raw still fails. The agent binary still runs (so its own side effects are out of scope), but the engine performs no filesystem mutations under `docs/cycle/issues/*` and no append/rewrite of `.cycle/tbd.jsonl` or `.cycle/log.jsonl`.

An empty `raw/` also exits `0`, so the exit code is meaningful only when at least one raw has been restored. Run the loop after each fix until the command exits `0` with the restored raws reported as passing.

### 3. Fix the failing raws

For each entry in `last_errors`, choose one path:

- **Edit `docs/cycle/issues/failed/<id>.md`** if the issue is real but its content tripped the prompt (typo, missing context, ambiguous title, malformed frontmatter). Move it back to `raw/` (`mv docs/cycle/issues/failed/<id>.md docs/cycle/issues/raw/<id>.md`) and re-run `cycle triage --dry-run` until it passes.
- **Delete the file** (`rm docs/cycle/issues/failed/<id>.md`) if the issue should not have been queued at all — a duplicate, an obsolete reflection finding, or anything the human queue manager would have rejected in review.

If the failure mode is a broken prompt rather than bad raws, edit the configured triage prompt instead (and `npm run sync-defaults` if you changed `src/defaults/`), then move the affected raws back to `raw/` and re-run `cycle triage --dry-run`.

### 4. Re-fire the engine

Once `cycle triage --dry-run` exits `0` with the restored raws reported as passing, restart the engine using the same invocation that originally hit the pause (e.g., `cycle` or `./.cycle/bin/cycle.js`, depending on how it was launched). No rollback or cleanup step is required.

### Safety guarantee

The paused pass started no cycle, pushed no branch, opened no PR, and made no change to `tbd.jsonl` or `done/`. The only on-disk side effects are the raw files moved from `raw/` to `failed/` (with `failed_step: "triage"` frontmatter stamped) and the `engine.paused` line plus preceding `triage.raw.failed` events in `.cycle/log.jsonl`. Re-firing therefore picks up cleanly: triage runs again from scratch on whatever raws now sit in `raw/`, and the queue resumes as if the failed pass had never started.
