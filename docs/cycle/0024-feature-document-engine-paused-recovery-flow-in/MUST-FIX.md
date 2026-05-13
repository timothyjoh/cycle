# Must-Fix Items: Cycle 0024

## Summary
1 critical issue, 0 minor issues found in review. The new `## Recovering from engine.paused` section in `README.md` documents a recovery flow that does not match the actual engine behavior. Specifically, the implementation in `src/engine/triage.ts` moves every failed raw to `docs/cycle/issues/failed/<id>.md` (via `moveToFailed` at L225) and mutates each raw's frontmatter on every retry (via `bumpAttempts` at L204) *before* `engine.paused` is emitted (L242). The README's "safety guarantee" — that the paused pass never wrote to `raw/` and that operators iterate by editing files still in `raw/` — is therefore false in practice. Following the doc as written, an operator would `ls docs/cycle/issues/raw/` after a pause, see it empty, and have no way to recover.

## Tasks

- [x] ### Task 1: Rewrite the README recovery section to match actual engine behavior
  **Status:** ✅ Fixed
  **What was done:** Rewrote the `## Recovering from engine.paused` section in `README.md` (L11–L72) to match the actual engine behavior at `src/engine/triage.ts:225` (`moveToFailed` runs per-raw before `engine.paused` is emitted). Specific changes: (1) intro now states the engine "moves each failed raw to `docs/cycle/issues/failed/<id>.md` with `failed_step: \"triage\"` stamped" and only claims `tbd.jsonl` is untouched; (2) step 1 retitled "Inspect the pause event and the failed raws" and adds `ls docs/cycle/issues/failed/` plus a note that `triage.raw.failed` events also land in the audit log; (3) step 2 makes explicit that `cycle triage --dry-run` reads only `raw/`, shows the `mv failed/<id>.md raw/<id>.md` restore step, and calls out that an empty `raw/` exits 0 vacuously so the exit code is meaningful only after at least one restore; (4) step 3 now points the edit-vs-delete guidance at `failed/<id>.md` and includes the `mv` back to `raw/` before re-running dry-run; (5) safety guarantee was rewritten to keep the true claims (no cycle started, no branch pushed, no PR opened, `tbd.jsonl` and `done/` unchanged) and drop the false `raw/` claim, while also acknowledging the `triage.raw.failed` events as a real side effect.
  **Deviation:** MUST-FIX verify check 1 expects zero `raw/<id>.md` occurrences in the section, but MUST-FIX's own prescribed fix includes `mv docs/cycle/issues/failed/<id>.md docs/cycle/issues/raw/<id>.md`. Two `raw/<id>.md` matches remain — both are `mv` destinations restoring a failed raw, which is the recovery flow MUST-FIX defines. The intent of check 1 (don't tell the operator to edit/delete a non-existent `raw/<id>.md`) is satisfied: no edit/delete instruction targets that path. Verify checks 2 (`grep -c 'docs/cycle/issues/failed'` → 5, ≥ 2), 3 (no `ls raw/` step, no edit instruction at `raw/<id>.md`), 4 (`npm test` 286/286 pass, `npm run typecheck` clean), and 5 (coverage 97.14 / 90.64 / 96.21, unchanged from baseline) all pass.
  **Priority:** Critical
  **Files:** `README.md` (lines added in cycle 0024, currently L11–L65)
  **Problem:** Three claims in the new section are factually wrong vs `src/engine/triage.ts`:

  1. **Intro (L13)** — "exits non-zero **without mutating `raw/` or `tbd.jsonl`**." False for `raw/`. Code path: every failed raw is run through `bumpAttempts` (writes `triage_attempts: N` to the raw's frontmatter on each attempt failure — `triage.ts:204`) and then `moveToFailed` (stamps `failed_at`, `failed_step: "triage"`, `triage_attempts: 3` and renames `raw/<id>.md → failed/<id>.md` — `triage.ts:225, 657–675`). Only `tbd.jsonl` is genuinely untouched.

  2. **Step 3 "Fix the failing raws" (L51–L56)** — instructs operators to edit or delete `docs/cycle/issues/raw/<id>.md`. After a pause those files no longer exist in `raw/`; they are at `docs/cycle/issues/failed/<id>.md` with terminal failure frontmatter stamped. Editing the path the README names is a no-op (file not found).

  3. **Step 2 "Iterate with `cycle triage --dry-run`" (L41–L49)** — `dryRunTriage` reads `docs/cycle/issues/raw` (`triage.ts:267–269`). When all raws were moved to `failed/`, `loadRaws` returns `[]` and dry-run exits 0 with empty output. The doc tells the operator to "run the loop after each fix until the command exits `0`" — but that exit code is already 0 from an empty directory, regardless of whether the underlying raws are fixed.

  4. **Step 4 "Safety guarantee" (L62–L65)** — claims "The paused pass never wrote to `raw/`, never appended to `tbd.jsonl`, and never moved any file to `done/`. The only side effect of the failed pass is the `engine.paused` line in `.cycle/log.jsonl`." Wrong on `raw/` (mutated + emptied) and incomplete on `log.jsonl` (the pass also emits a `triage.raw.failed` event per attempt per raw before the final `engine.paused`).

  **Fix:** Rewrite the section so the recovery flow names `failed/` as the post-pause location and instructs operators to either restore raws to `raw/` for retest or delete them to drop. Concrete edits:

  1. Intro sentence: replace "without mutating `raw/` or `tbd.jsonl`" with something honest, e.g.:

     > When every raw issue fails triage in a single pass, the engine emits `engine.paused {reason: "all_triage_failed", raw_ids, last_errors}`, moves each failed raw to `docs/cycle/issues/failed/<id>.md` with `failed_step: "triage"`, and exits non-zero. `tbd.jsonl` is untouched and no cycle was started, so the work queue is intact and the engine is safe to re-fire once the underlying problem is fixed.

  2. Add a new **Inspect the failed raws** sub-step (or fold it into step 1) showing:

     ```sh
     ls docs/cycle/issues/failed/
     ```

     and noting that raws stamped with `failed_step: triage` are the ones the paused pass moved.

  3. Step 2 ("Iterate with `cycle triage --dry-run`"): make explicit that dry-run only sees files in `raw/`, so the iterate loop is:

     ```sh
     mv docs/cycle/issues/failed/<id>.md docs/cycle/issues/raw/<id>.md
     # ...edit the file...
     cycle triage --dry-run
     ```

     and call out that exit `0` on an empty `raw/` is meaningless — the operator must restore at least one raw before the dry-run is informative.

  4. Step 3 ("Fix the failing raws"): change every `docs/cycle/issues/raw/<id>.md` to `docs/cycle/issues/failed/<id>.md` for the edit-vs-delete guidance, and update the edit path to include the `mv failed → raw` step from #3. Drop guidance is `rm docs/cycle/issues/failed/<id>.md`.

  5. Safety guarantee paragraph: keep `tbd.jsonl` (correct) and `done/` (correct). Drop the false `raw/` claim. Replace with the real guarantee: no cycle was started, no branch was pushed, no PR was opened, `tbd.jsonl` is unchanged, so the operator can recover by restoring or dropping `failed/` raws and re-firing without any cleanup of queue state.

  **Verify:**

  1. After the rewrite, grep README to confirm zero remaining occurrences of `raw/<id>.md` inside the recovery section (replace all with `failed/<id>.md`):
     ```sh
     awk '/^## Recovering from engine.paused/,/^## /' README.md | grep -c 'raw/<id>.md'
     ```
     Expected: `0`.
  2. Grep to confirm `failed/` is now named in the recovery section:
     ```sh
     awk '/^## Recovering from engine.paused/,/^## /' README.md | grep -c 'docs/cycle/issues/failed'
     ```
     Expected: ≥ 2 (inspection + edit/delete guidance).
  3. Re-read the section end-to-end as if responding to a paused-engine alert; confirm `ls docs/cycle/issues/raw/` is not a step in the flow and that the operator is never told to edit a non-existent `raw/<id>.md`.
  4. `npm test` and `npm run typecheck` still pass (docs-only diff; no behavior change expected).
  5. Coverage unchanged: `npm run test:coverage` reports ≥ 95 / 75 / 90 (current: 97.14 / 90.64 / 96.21).

  **Note for follow-up (not part of this fix):** the underlying ergonomic problem — that `moveToFailed` runs *inside* the per-raw failure branch even when the whole pass is about to be paused — arguably belongs to a future engine cycle. If the team prefers the doc's original story (raws stay in `raw/` on whole-pass failure), open a separate raw to defer `moveToFailed` until after the `failed.length === raws.length` check. For this cycle, the docs must reflect the engine as it actually behaves at HEAD.
