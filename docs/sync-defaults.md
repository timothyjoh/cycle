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

## The canonical divergent file

`.cycle/workflows.yml` — the dogfood copy runs a trunk-based variant (`no_branch: true`, `commit-trunk.sh`, no `pr` step) that the shipped default does not carry. The guard exists to prevent a stray `sync-defaults` from silently re-clobbering it (the 0046 incident).
