Plan resolved. Writing PLAN.md to stdout now.

```markdown
# Implementation Plan: Cycle 0069

## Overview
Delete the phantom `docs/cycle/issues/todo/failed-blocked-frontmatter.md` (whose underlying feature already shipped in cycle 0025 commit `b6662c3`) and drop the dormant `cycle-0027-debris-quarantine` stash, in a single rich-body commit on `master`, before `gc.reflogexpire` silently reclaims the stash.

## Current State (from Research)
- Phantom todo file present at `docs/cycle/issues/todo/failed-blocked-frontmatter.md` (44 lines, `id: failed-blocked-frontmatter`); historical raw lives at `docs/cycle/issues/done/failed-blocked-frontmatter_raw.md` and stays put per SPEC.
- Shipped feature it asks for is live at `src/cli.ts:121-176` (`terminalDrain` happy path `135-138`, fallback path `162-165`); shipping commit `b6662c3 cycle 0025: Add structured frontmatter to failed/ and blocked/ file moves`.
- Local stash exactly one entry: `stash@{0}: On cycle/feature/cleanup-remove-deprecated-tbd-queued-tri: cycle-0027-debris-quarantine` (`2 files / 49 deletions`); the `.cycle/tbd.jsonl.bootstrap-archive` half is a no-op (file already absent at HEAD per cycle 0028); the `failed-blocked-frontmatter.md` half is the live deletion target.
- Trunk-based dogfood `feature` workflow at `.cycle/workflows.yml:11-31` runs `no_branch:true` with `scripts/commit-trunk.sh` (no `pr` step). `.cycle/scripts/commit-trunk.sh` is byte-identical to `src/defaults/scripts/commit-trunk.sh` — it stages the working tree, denylist-filters `.claude/`, `dist/`, `node_modules/`, `.cycle/cycle.pid`, `*.lock`, then `git commit -m "cycle ${CYCLE_ID}: ${CYCLE_TITLE}" [-m "$closes"]` and `git push origin <branch>`. There is **no hook** for arbitrary body content beyond `closes_block`'s `Closes #N` lines.
- `.cycle/tbd.jsonl` carries no live row whose `id` is `failed-blocked-frontmatter` (verified — the only matching grep hit is this cycle's title substring, not an id).
- Engine env to bash steps (`src/engine/run-cycle.ts:102-105`): `CYCLE_ID`, `CYCLE_TITLE`, `CYCLE_BASE`, `CYCLE_ISSUE_ID`. No `CYCLE_SLUG` / `CYCLE_ARTIFACT_DIR`.

## Desired End State
- HEAD of `master` no longer contains `docs/cycle/issues/todo/failed-blocked-frontmatter.md`.
- `git stash list` is empty (or at least contains no `cycle-0027-debris-quarantine`).
- One commit on `master` whose body references cycles 0025 → 0027 → 0028 → 0069 and states `disposition: delete (issue shipped in b6662c3)` (see "Resolved Open Questions" for the strict reading).
- `npm test`, `npm run typecheck`, and `npm run test:coverage` (per-file gate `src/engine/triage.ts ≥ 95%`) all green.
- No file under `src/`, `.cycle/workflows.yml`, `.cycle/prompts/`, `src/defaults/`, or `.cycle/scripts/` is modified.

## What We're NOT Doing
- Not modifying any source under `src/` (engine code, CLI, defaults).
- Not modifying `.cycle/workflows.yml`, `.cycle/prompts/*`, `.cycle/scripts/commit-trunk.sh`, or any other engine-adjacent infrastructure.
- Not touching `.cycle/tbd.jsonl` (already consistent — no row to remove).
- Not relocating `docs/cycle/issues/done/failed-blocked-frontmatter_raw.md` (per SPEC: it stays put as historical record).
- Not auditing other potentially-phantom `todo/` files (out of scope per source issue).
- Not addressing the `.cycle/tbd.jsonl.bootstrap-archive` half of the stash (cycle 0028 already settled it; the stash drop covers it implicitly).
- Not amending or force-pushing existing commits.
- Not adding tests (no source under test changes; SPEC explicitly: "No new test files").
- Not updating `CLAUDE.md`, `README.md`, `AGENTS.md`, or `docs/ARCHITECTURE.md` (per SPEC Documentation Updates: "no change").

## Implementation Approach

The build step performs the substantive work as a single manual commit + push + stash drop sequence, because the dogfood `commit-trunk.sh` accepts no rich-body input and SPEC forbids modifying it. The engine's later `commit` step (which still runs `commit-trunk.sh`) bundles whatever review/verify artifacts exist into a separate, standard cycle-wrap commit — that is the dogfood norm for every cycle on this repo and does not satisfy or invalidate the SPEC's body criterion (see Resolved Open Questions).

Sequencing rationale:
- The deletion + stash drop are paired in the build step so the audit trail is durable on `origin/master` BEFORE `git stash drop` runs (SPEC requirement: "Stash dropped via `git stash drop stash@{0}` AFTER the deletion is committed").
- `git rm` (not plain `rm`) is used per SPEC literal.
- `git push origin master` runs immediately after the commit so `gc.reflogexpire` cannot silently reclaim the stash before the deletion is durable upstream.

### Resolved Open Questions

1. **Where does `git stash drop` execute?** Inside the build step, AFTER `git push origin master` returns 0. This places the deletion on `origin/master` before the stash is released, satisfying the SPEC's "AFTER the deletion is committed" sequencing — `commit-trunk.sh:86-87` confirms `push` is the durability boundary.
2. **`git rm` vs plain `rm`.** Use `git rm` per SPEC literal at line 23 of SPEC.md.
3. **Commit message body shape.** Construct a multi-paragraph body via `git commit -m "<subject>" -m "<body>"` in the build step's manual commit. The `commit-trunk.sh:79,81` pattern of `-m subject [-m closes]` is mirrored; the build's manual commit substitutes the rich body for `closes` (the cycle's source issue file contains no GitHub issue URLs, so `closes_block` would emit empty anyway).
4. **Verification commands in commit body.** Embed both the LITERAL commands AND their captured output as a "Pre-disposition verification" block in the body. The build step runs each command, captures stdout, and inlines into the heredoc body before `git commit`.
5. **"Exactly one new commit" interpretation.** SPEC Acceptance Criterion #4 reads: "Exactly one new commit on the cycle branch **whose body references cycles 0025 → 0027 → 0028 → 0069 and states `disposition: delete (issue shipped in b6662c3)`**." Plan adopts the pedantic reading: exactly one commit must satisfy the body clause (the build's manual commit). The dogfood commit-trunk wrap commit that follows (carrying SPEC/RESEARCH/PLAN/BUILD/REVIEW/VERIFY artifacts) is standard cycle ceremony, has no body, and does not reference those cycles — it neither satisfies nor violates the body criterion. This reading is consistent with the source issue's "One commit (or coherent commit series)" allowance. Mitigation if reviewer rejects: see Risk Assessment.

---

## Task 1: Build step — verify, delete, commit, push, drop stash

### Overview
Execute the SPEC's substantive work end-to-end inside the `build` step. The build prompt receives standard env (`CYCLE_ID`, `CYCLE_TITLE`, `CYCLE_BASE`, `CYCLE_ISSUE_ID`) plus the working tree at the post-plan state. Build does NOT modify any infrastructure file; it runs git commands directly and writes the rich body inline.

### Changes Required

**Phantom file**: `docs/cycle/issues/todo/failed-blocked-frontmatter.md`
**Change**: Removed via `git rm`.

**Local-only stash**: `stash@{0}` (`cycle-0027-debris-quarantine`)
**Change**: Dropped via `git stash drop stash@{0}` after `git push` returns 0.

**No file content edited** — the build step is a sequence of git operations, not file rewrites.

### Build step concrete sequence (executed in `build` prompt's shell)

```sh
# 1. Pre-disposition verification — capture output for the commit body.
SHIP_COMMIT=$(git log --oneline --grep=frontmatter | grep 'cycle 0025' | head -1)
STAMP_HAPPY=$(grep -nE 'last_cycle_id:\s*cycleId' src/cli.ts | head -1)
STAMP_FALLBACK=$(grep -nE 'last_cycle_id:\s*cycleId' src/cli.ts | tail -1)
TBD_HITS=$(grep -c failed-blocked-frontmatter .cycle/tbd.jsonl)
STASH_PRESENT=$(git stash list | grep -c cycle-0027-debris-quarantine)
TODO_PRESENT=$(test -f docs/cycle/issues/todo/failed-blocked-frontmatter.md && echo present || echo absent)

# 2. Sanity-gate the preconditions before mutating anything.
[ -n "$SHIP_COMMIT" ]                    || { echo "SHIP_COMMIT empty — abort"; exit 1; }
[ "$STASH_PRESENT" = "1" ]               || { echo "stash entry missing — abort"; exit 1; }
[ "$TODO_PRESENT" = "present" ]          || { echo "phantom file already absent — abort"; exit 1; }
[ "$TBD_HITS" = "0" ]                    || { echo "tbd.jsonl has matching id — investigate"; exit 1; }

# 3. Delete the phantom (literal `git rm` per SPEC).
git rm docs/cycle/issues/todo/failed-blocked-frontmatter.md

# 4. Manual commit with rich body (subject mirrors commit-trunk's format).
git commit \
  -m "cycle 0069: Resolve dormant cycle-0027 debris stash" \
  -m "$(cat <<'EOF'
Disposition: delete (issue shipped in b6662c3).

The phantom todo docs/cycle/issues/todo/failed-blocked-frontmatter.md
described frontmatter-stamping work that already shipped in cycle 0025
(b6662c3 cycle 0025: Add structured frontmatter to failed/ and blocked/
file moves). The dormant stash cycle-0027-debris-quarantine carries the
same deletion plus an already-settled .cycle/tbd.jsonl.bootstrap-archive
removal. Cycle 0028 first flagged the stash as dormant. This cycle
(0069) deletes the phantom todo and drops the stash before
gc.reflogexpire silently reclaims the snapshot.

Cross-references:
- cycle 0025 (b6662c3): origin of the shipped feature (terminalDrain
  stamps failed_at, failed_step, failed_attempts, last_cycle_id at
  src/cli.ts:135-138 happy path and src/cli.ts:162-165 fallback path)
- cycle 0027: origin of the stash (cycle-0027-debris-quarantine)
- cycle 0028: where the stash was first flagged as dormant
- cycle 0069: this cycle — delete phantom + drop stash

Pre-disposition verification:
- git log --oneline --grep=frontmatter | head -1
  -> <SHIP_COMMIT_OUTPUT>
- src/cli.ts last_cycle_id stamps:
  -> <STAMP_HAPPY_OUTPUT>
  -> <STAMP_FALLBACK_OUTPUT>
- grep -c failed-blocked-frontmatter .cycle/tbd.jsonl
  -> 0
- git stash list | grep -c cycle-0027-debris-quarantine (pre-drop)
  -> 1

Stash drop happens AFTER push so the audit trail is durable on
origin/master before the reflog snapshot is released.
EOF
)"

# 5. Push to origin/master so the deletion is durable upstream.
git push origin master

# 6. Drop the dormant stash (audit trail now durable).
git stash drop stash@{0}

# 7. Post-disposition verification (echoed to BUILD.md stdout).
git stash list
ls docs/cycle/issues/todo/failed-blocked-frontmatter.md 2>&1 || echo "ENOENT (expected)"
grep -c failed-blocked-frontmatter .cycle/tbd.jsonl
```

The placeholders `<SHIP_COMMIT_OUTPUT>`, `<STAMP_HAPPY_OUTPUT>`, `<STAMP_FALLBACK_OUTPUT>` are interpolated from the captured shell variables before `git commit` runs (the build prompt assembles the body string with those substitutions).

### Success Criteria
- [ ] `git log -1 --pretty=%s origin/master` returns `cycle 0069: Resolve dormant cycle-0027 debris stash`.
- [ ] `git log -1 --pretty=%b origin/master` contains all of: `0025`, `0027`, `0028`, `0069`, `b6662c3`, `disposition: delete`.
- [ ] `git diff --name-status HEAD~1 HEAD` shows exactly `D docs/cycle/issues/todo/failed-blocked-frontmatter.md`.
- [ ] `git stash list` does NOT contain `cycle-0027-debris-quarantine`.
- [ ] `ls docs/cycle/issues/todo/failed-blocked-frontmatter.md` exits non-zero (ENOENT).
- [ ] `grep -c failed-blocked-frontmatter .cycle/tbd.jsonl` returns `0`.
- [ ] No file under `src/`, `.cycle/workflows.yml`, `.cycle/prompts/`, `.cycle/scripts/`, or `src/defaults/` is in the diff.

---

## Task 2: Engine wrap (review / verify / commit-trunk) is observed, not authored

### Overview
The engine's standard sequence (`review` → `fix` (skipped, no MUST-FIX.md) → `verify` → `commit` → `reflection` → `documentation`) runs unchanged after the build step. This task is a no-op — it documents what the plan EXPECTS to happen so the build step does not accidentally interfere with later steps.

### Expected behavior (no changes required)
- **review**: writes `docs/cycle/0069-…/REVIEW.md` reviewing `git diff CYCLE_BASE...HEAD` (which now shows the deletion + the manual commit's other staged content). May produce `MUST-FIX.md`; if so, `fix` runs.
- **verify**: runs `scripts/verify.sh` (`npm test` + typecheck + coverage gate). Expected green: the cycle deletes a markdown file with no source imports; coverage floor is structurally unaffected because `src/engine/triage.ts` is not in the diff.
- **commit (commit-trunk.sh)**: stages REVIEW.md + VERIFY.md (and any other artifacts from those steps) and emits a standard cycle-wrap commit `cycle 0069: Resolve dormant cycle-0027 debris stash` with empty body (no `closes_block` matches because the source issue carries no GitHub URLs). Pushes to `origin/master`. This is the second commit on `master` from this cycle; per Resolved Open Question #5, it does NOT contend for the SPEC's body-criterion slot.
- **reflection / documentation**: write `REFLECTION.md` and `DOCUMENTATION.md` post-commit; ride the next cycle's commit-trunk normally (existing pattern, see cycle 0067/0068's commit `3f980bb`).

### Success Criteria
- [ ] `npm test` exits 0 inside `verify` step.
- [ ] `npm run typecheck` exits 0 inside `verify` step.
- [ ] `npm run check:coverage` exits 0 inside `verify` step (per-file floor `src/engine/triage.ts ≥ 95%` unchanged).
- [ ] commit-trunk.sh's wrap commit is recorded as `step.end commit ok` in `.cycle/log.jsonl`.

---

## Testing Strategy

### Unit Tests
None. SPEC explicitly: "No new test files. No E2E. No UI surface." The deletion target is a markdown doc with no source imports.

### Integration / E2E Tests
None. Manual verification commands are embedded in the rich-body commit AND echoed by the build step's stdout (captured to `BUILD.md`).

### Manual verification (executed inside build, captured into BUILD.md)
- `git log -1 --pretty=%B origin/master | head -25` — confirms rich body landed.
- `git stash list` — confirms stash absent.
- `ls docs/cycle/issues/todo/failed-blocked-frontmatter.md` — expect ENOENT.
- `grep -c failed-blocked-frontmatter .cycle/tbd.jsonl` — expect `0`.

### Coverage policy
- `src/engine/triage.ts` line floor remains ≥ 95% — structurally unaffected (no source change).
- Global baseline (line ≥ 95%, branch ≥ 75%, func ≥ 90%) remains intact — no source diff.

## Risk Assessment

- **Risk: SPEC reviewer reads "exactly one new commit" as commit-count rather than commit-with-body-criterion.** Mitigation: BUILD.md includes a paragraph explaining the pedantic reading and pointing to the source issue's "coherent commit series" allowance. If review insists on strict 1-commit, the fallback is a follow-up cycle that extends `.cycle/scripts/commit-trunk.sh` (and its `src/defaults/` mirror, in a separate dedicated cycle) with a sentinel-file body hook — explicitly out of scope here per SPEC's "no functional code" requirement.
- **Risk: `git push origin master` fails (network, remote rejection, hooks).** Mitigation: build step exits non-zero on push failure; engine retries the cycle up to `max_cycle_attempts: 3`. The deletion + commit are local-only on push failure; on retry, the build step's precondition check (`STASH_PRESENT == 1`) will fail because the deletion commit is already local — so the retry must detect the already-local-commit case. **Add to build:** if `git log -1 --pretty=%s` already matches `cycle 0069: Resolve dormant cycle-0027 debris stash`, skip the commit step and proceed directly to `git push` + stash drop (idempotent retry).
- **Risk: Stash drop runs but push has not yet propagated remotely (CDN replication lag).** Mitigation: `git push origin master` is synchronous on git's side; the local reflog containing the commit is durable independently of remote replication. Acceptable risk.
- **Risk: `verify` (npm test) fails after the build's commit + push has already landed on `origin/master`.** Mitigation: this cycle's diff deletes a doc file with no source imports; `npm test` cannot fail because of the deletion. Pre-flight: build step runs `npm test --silent` (capturing exit code) BEFORE the manual commit; abort the cycle if pre-flight fails. **Add to build sequence between steps 3 and 4:** run `npm test --silent` and exit non-zero on failure.
- **Risk: `closes_block` in commit-trunk.sh's later wrap-commit accidentally pulls in stale GitHub URLs from the source issue file.** Mitigation: source issue `refl-0028-dormant-stash-cycle-0027-debris-quaranti.md` contains no `https://github.com/.../issues/N` URLs (verified — body is plain markdown). `closes_block` will emit empty.
- **Risk: Build step accidentally edits a SPEC-forbidden file.** Mitigation: build step's final action before exit is `git diff --name-only HEAD~1 HEAD | grep -E '^(src/|\.cycle/(workflows\.yml|prompts/|scripts/)|src/defaults/)'` — exit non-zero if any match.
```
