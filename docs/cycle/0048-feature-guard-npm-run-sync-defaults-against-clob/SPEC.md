```markdown
# SPEC — Cycle 0048: Guard `sync-defaults` Against Clobbering Divergent Files

## Objective
Add a content-hash guard to `scripts/sync-defaults.mjs` so it refuses to overwrite `.cycle/*` files that have diverged from their `src/defaults/*` source. This closes the failure mode that produced the 0046 incident — an agent running `sync-defaults` to propagate one file silently re-clobbered `.cycle/workflows.yml`'s trunk-based divergence. With this guard, a future agent running `sync-defaults` either succeeds without touching divergent paths, or exits with a clear, agent-readable message listing what it skipped.

## Source Issue
`refl-0046-sync-defaults-clobbers-local-trunk-based-guard-sync-defaults-against-divergent-files` — "Guard `npm run sync-defaults` against clobbering locally-divergent files"

## Scope

### In Scope
- Replace the unconditional copy loop in `scripts/sync-defaults.mjs` with a content-hash guard (approach (b)) that uses `.cycle/.sync-state.json` to detect local divergence and skips overwrites unless `--force` is passed.
- Add `tests/defaults/sync-defaults-guard.test.ts` covering clean sync, divergent-file skip, and `--force` override.
- Document the guard contract + override in `CLAUDE.md` and gitignore `.cycle/.sync-state.json`.

### Out of Scope
- The durable runtime-override fix that eliminates the `.cycle/workflows.yml` divergence (sibling cycle).
- Generalizing the guard to config files outside the `src/defaults/ → .cycle/` flow.
- Engine-side changes — guard stays self-contained in the script.
- Hotfix to restore `.cycle/workflows.yml` (depended-on sibling; assumed landed before this cycle runs).

## Requirements

### Functional
- **Clean sync:** when no `.cycle/*` destination diverges from its `src/defaults/*` source, behavior is unchanged from today — every file is copied, exit 0, identical `synced <from> → <to>` log lines.
- **Divergence detection:** for each source/destination pair the script would copy, compute sha256 of both files and compare against the last-sync hash stored in `.cycle/.sync-state.json` (map keyed by destination path → `{ src_sha256, dst_sha256 }` recorded at the last successful sync). A destination is "locally divergent" iff its current hash matches neither (i) the recorded `dst_sha256` from last sync nor (ii) the current source hash. Missing state file or missing entry treats the destination as divergent if it exists and differs from source, clean if absent.
- **Refuse-on-divergence:** if any divergent destination is detected, the script copies the non-divergent files, prints a warning block listing every skipped path with a one-line reason ("locally divergent"), and exits with a non-zero status (`2`) whose stderr summary states the skip count. No partial state is written for the skipped paths.
- **`--force` override:** passing `--force` (and equivalently env `CYCLE_SYNC_DEFAULTS_FORCE=1`) bypasses the guard for all paths: every file is copied, a single-line `force: overwriting N divergent path(s): …` warning is printed to stderr, exit 0.
- **State bookkeeping:** on every successful copy (clean or `--force`), record `{ src_sha256, dst_sha256 }` for that destination in `.cycle/.sync-state.json` (atomic write via tmp + rename). Skipped paths' prior entries (if any) are left untouched.
- **Directory targets:** the existing `prompts/` and `scripts/` directory pairs must be expanded to per-file pairs for hashing — the guard operates at file granularity, not directory granularity, so a divergent `.cycle/prompts/spec.md` doesn't block sync of `.cycle/prompts/build.md`.

### Non-functional
- No new runtime dependencies; sha256 via `node:crypto`, args via simple `process.argv` parse (no commander/yargs).
- Script remains ESM, runnable via `node scripts/sync-defaults.mjs` and `npm run sync-defaults`.
- Output remains plain stdout/stderr text — no JSON, no colors required. Skip messages are grep-able and identify full paths.
- The `workflows.yml` teardown of legacy `.cycle/workflows/` directory continues to work (still removed; not protected by the guard since it's a directory removal, not a divergent file overwrite).

## Acceptance Criteria
- [ ] Running `npm run sync-defaults` against a clean repo (no divergence) copies every `src/defaults/*` file to `.cycle/*` and exits 0, identical to today's behavior aside from `.sync-state.json` being written.
- [ ] Running `npm run sync-defaults` while `.cycle/workflows.yml` is in its trunk-based divergent state (sha differs from `src/defaults/workflows.yml`) does NOT overwrite that file; other paths are still synced; the script exits with a non-zero status; stderr lists `.cycle/workflows.yml` as skipped with reason "locally divergent" and a final summary line stating `1 path(s) skipped`.
- [ ] Running `npm run sync-defaults -- --force` in the same divergent state overwrites every file (including `.cycle/workflows.yml`), prints a single force-warning line listing the overridden paths, and exits 0.
- [ ] Running with `CYCLE_SYNC_DEFAULTS_FORCE=1` (no flag) is equivalent to `--force`.
- [ ] `.cycle/.sync-state.json` is created/updated atomically after successful copies and is listed in `.gitignore`.
- [ ] `CLAUDE.md` gains a section under "Commands" (or adjacent) describing the guard contract: how divergence is detected, what happens on detection, and how to override.
- [ ] New tests in `tests/defaults/sync-defaults-guard.test.ts` cover: (i) clean sync, (ii) divergent-file sync, (iii) `--force` override, (iv) env-var override, (v) state file written after successful copy and absent for skipped paths.
- [ ] The sibling hotfix's regression test on `.cycle/workflows.yml` (whatever its name) continues to pass alongside the new tests.
- [ ] `npm test` passes (full suite); `npm run typecheck` clean; `npm run test:coverage` shows line ≥ 95%, branch ≥ 75%, function ≥ 90% with no per-file regression on `scripts/sync-defaults.mjs`.

## Testing Strategy
- **Framework:** Node's native `node:test` runner with `assert/strict`, matching the rest of `tests/defaults/`.
- **Approach:** each test creates a tmp directory with mock `src/defaults/` and `.cycle/` trees (using `node:fs/promises` `mkdtemp`), `spawnSync`s `node scripts/sync-defaults.mjs` with `cwd` set to the tmp dir (array args, no shell), and asserts on exit code, stdout/stderr substrings, post-state file contents, and `.sync-state.json` contents.
- **Key scenarios:**
  1. Happy path / clean sync — no destination exists, all files copied, state file written.
  2. Re-sync no-op — second run after clean sync, no divergence, exit 0, no warnings.
  3. Local divergence on one file — pre-populate `.cycle/workflows.yml` with content differing from `src/defaults/workflows.yml`, run sync, assert that file is preserved, others copied, exit 2, stderr names the skipped path.
  4. `--force` override — same divergent setup, run with `--force`, assert file is overwritten, exit 0, force-warning printed.
  5. Env var override — same divergent setup, run without flag but with `CYCLE_SYNC_DEFAULTS_FORCE=1`, assert equivalent to `--force`.
  6. State file recording — after a successful run, `.cycle/.sync-state.json` contains entries for every copied destination with both shas; after a skipped run, the divergent path has no new entry written (prior entry preserved if it existed).
  7. Directory granularity — divergent `.cycle/prompts/spec.md` does not block `.cycle/prompts/build.md` from being synced.
- **No engine / no CLI E2E** — guard is a standalone script; existing `tests/defaults/scripts.test.ts` patterns are the model.

## Documentation Updates
- **CLAUDE.md:** under the `## Commands` table or as a new subsection, document the guard: what `.sync-state.json` is, when `sync-defaults` will refuse a path, how to override (`--force` / env var), and a one-line note that `.cycle/workflows.yml` is currently the canonical divergent file the guard exists to protect.
- **README.md:** no user-facing change — `sync-defaults` is a dogfood-only command for the cycle repo itself, not a published-CLI surface.
- **`.gitignore`:** add `.cycle/.sync-state.json`.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Sibling cycle `refl-0046-sync-defaults-clobbers-local-trunk-based-hotfix-restore-workflows-yml-divergence` must land first so `.cycle/workflows.yml` actually exists in its divergent state when this cycle's tests and operators run. Triage already encoded this via `depends_on`.
- Node ≥ 22.6 (existing repo floor), `node:crypto`, `node:fs/promises`, `node:path`, `node:test`. No new external deps.
- No env vars or external services required beyond the optional `CYCLE_SYNC_DEFAULTS_FORCE`.
```
