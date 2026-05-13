---
id: cli-drop-writes-to-raw-fix-drop-target
title: "CLI: cycle drop writes to raw/ (not tbd/)"
workflow: feature
depends_on: []
triaged_at: "2026-05-13T18:11:17.546Z"
source: triage
parent: cli-drop-writes-to-raw
---
## Context

After the issue-lifecycle restructure (RFC-001), the external inbox is `docs/cycle/issues/raw/`. The `cycle drop "<text>"` command in `src/cli/` still writes to the legacy `tbd/` path. Bring it in line so external agents and humans drop into `raw/`, which is the only folder the triage subroutine reads from.

## Scope

- Update `cycle drop` implementation in `src/cli/` to write to `docs/cycle/issues/raw/<id>.md`.
- File id/slug generation stays the same (`txt-<UTC>-<slug>.md`).
- Frontmatter must satisfy what triage expects on a raw: `id`, `source: text`, `title`, `added_at`, `triage_attempts: 0`, `priority` (default 3 if not supplied).
- Remove any code path that still references `tbd/` as the drop target.
- Update `--help` text and any CLI docs that mention the drop target.

## Acceptance

- `cycle drop "foo"` creates exactly one file under `docs/cycle/issues/raw/`, with valid triage-ready frontmatter.
- No file is written to `docs/cycle/issues/tbd/` (folder may not exist post-restructure).
- Unit test: invoking the drop handler with a fixed clock writes the expected file to `raw/` and the file parses via the existing frontmatter reader.
- Coverage does not regress against the master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%).

## Out of scope

- `cycle status` command (separate child issue).
- Any changes to the triage subroutine itself.
