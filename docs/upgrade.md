# `cycle upgrade` — non-destructive in-place engine refresh

`cycle upgrade` refreshes the engine bundle in a repo that is **already
initialized**, without destroying the customizations that are the primary
adoption lever. It is the safe-to-run-AFK counterpart to `cycle init`:

- `cycle init` is first-time scaffolding. It unconditionally writes every
  artifact, so re-running it in a customized repo clobbers your prompts,
  workflows, and scripts.
- `cycle upgrade` makes the safe choice the default: it always refreshes the
  never-edited engine artifacts, preserves user config unless you explicitly
  opt into overwriting it per category, and never touches engine state.

## Usage

```sh
./.cycle/bin/cycle.js upgrade [--overwrite-prompts] [--overwrite-workflows] [--overwrite-scripts] [--overwrite-all]
```

The command exits `0` on success and prints a concise summary of what was
refreshed, overwritten, and preserved.

## The three contracts

### 1. Always refreshed (engine artifacts)

These files are produced by the build and are never meant to be hand-edited, so
`cycle upgrade` overwrites them from the shipped engine bundle / defaults on
**every** run, regardless of flags:

- `.cycle/bin/cycle.js` — the bundled engine (copied from the located
  `dist/cycle.js`, re-`chmod`ed to `0o755`).
- `.cycle/package.json` — the `{ "type": "module", "private": true }` marker
  that tells Node the bundle is ESM.

### 2. Preserved by default (user-editable config)

These three categories are where users invest customization, so they are left
**byte-for-byte untouched** unless you opt in per category:

- `.cycle/workflows.yml` — engine, triage, and workflow configuration.
- `.cycle/prompts/**` — prompt templates for each workflow step and triage.
- `.cycle/scripts/**` — git / verification helpers.

### 3. Never touched (engine state)

These files and directories carry live engine state and are **never** written or
deleted by `cycle upgrade`, with or without any flag:

- `.cycle/.env`
- `.cycle/tbd.jsonl`
- `.cycle/log.jsonl`
- everything under `docs/cycle/issues/**`

Preservation here is structural: no write path in the command ever names a state
file.

## Overwrite flags

Each flag opts exactly one category back to the shipped defaults. They compose,
so you can pass any combination:

| Flag | Effect |
|---|---|
| `--overwrite-prompts` | Replace `.cycle/prompts/**` with shipped defaults. |
| `--overwrite-workflows` | Replace `.cycle/workflows.yml` with the shipped default. |
| `--overwrite-scripts` | Replace `.cycle/scripts/**` with shipped defaults. |
| `--overwrite-all` | Equivalent to passing all three flags above. |

### Clean-replace semantics for directory categories

`workflows.yml` is a single file, so an opt-in overwrite is a plain copy. The
directory categories (`prompts/`, `scripts/`) are **clean-replaced**: the
destination directory is removed first, then re-copied from defaults. This means
a stray user-added file under `.cycle/prompts/` or `.cycle/scripts/` does **not**
survive an explicit opt-in overwrite — the category ends up exactly matching the
shipped defaults. (Categories you do not opt into are not removed.)

## Error behavior

`cycle upgrade` never partially scaffolds or silently no-ops:

- **Uninitialized repo** — if there is no `.cycle/` directory (or `.cycle` is not
  a directory), the command exits non-zero with a message naming the missing
  `.cycle/` and directing you to run `cycle init` first. No files are written.
- **Unknown flag** — an unrecognized flag (e.g. `--overwrite-foo`) is reported
  as `Unknown flag(s): …` and exits non-zero before any filesystem access.
- **Engine bundle / defaults not locatable** — the underlying `locate*` helpers
  throw, and the error propagates (non-zero exit) rather than being swallowed.
- **A per-category overwrite failure** raises rather than leaving a category
  half-copied without surfacing the error.

## Idempotency

`cycle upgrade` is fully idempotent. The always-refresh writes are overwrite by
nature; the default-preserve path writes nothing to user categories; and an
opt-in clean-replace (`rm` then `cp`, with `force: true` tolerating a missing
target) yields the same end state on every run. Re-running it is always safe.
