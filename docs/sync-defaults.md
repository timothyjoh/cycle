# sync-defaults divergence guard

`scripts/sync-defaults.mjs` records a sha256 of every `src/defaults/* → .cycle/*` pair in `.cycle/.sync-state.json` (gitignored). On each run it re-hashes source and destination and refuses to overwrite a destination whose current sha matches neither the recorded `dst_sha256` from the last sync nor the current `src_sha256` — that's the "locally divergent" state.

When divergence is detected:
- Non-divergent paths are copied normally.
- Divergent destinations: stderr gets `skipped <path> — locally divergent`, plus a final `N path(s) skipped` summary.
- Exit code is `2`. No `.sync-state.json` entry is written for skipped paths.

To force-overwrite divergent destinations:

```sh
npm run sync-defaults -- --force
# or
CYCLE_SYNC_DEFAULTS_FORCE=1 npm run sync-defaults
```

Force prints `force: overwriting N divergent path(s): <comma-list>` and exits 0.

## Why divergence is allowed

A repo may intentionally customize an installed `.cycle/*` file (a tuned
prompt, a repo-specific `workflows.yml`, a local `verify.sh`). The guard
exists so that a routine `sync-defaults` does not silently clobber those
deliberate local edits — the operator must pass `--force` to overwrite a
divergent destination.
