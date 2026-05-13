---
id: refl-0019-cycle-drop-priority-flag-deferred-no-fol
title: "CLI: `cycle drop` accepts `--priority N` (1-10), defaults to 3"
workflow: feature
depends_on: []
triaged_at: "2026-05-13T18:32:35.295Z"
source: triage
---
## Context

SPEC §Out of Scope for cycle 0019 deferred a `--priority` CLI flag on `cycle drop` to a follow-up, but the deferral was never filed as a queue item. The only sibling child filed was `cli-drop-writes-to-raw-status-command`. Without this issue, the deferral lives only inside the cycle 0019 artifact and will be lost.

## Scope

Add an optional `--priority N` flag to the `cycle drop` CLI command:

- Accepts integer `N` in the range `1..10` (inclusive).
- Defaults to `3` when the flag is omitted (matches the implicit default already used by `materializeFreeformIssue`).
- Validation rejects out-of-range or non-integer values with a clear error message and non-zero exit code.
- Threaded through `materializeFreeformIssue` as an optional argument so the resulting `raw/<id>.md` frontmatter includes `priority: N`.

## Acceptance

- `cycle drop "foo" --priority 7` writes `raw/<id>.md` with `priority: 7` in frontmatter.
- `cycle drop "foo"` (no flag) writes `priority: 3`.
- `cycle drop "foo" --priority 0` and `--priority 11` exit non-zero with a validation error.
- `--help` text for `cycle drop` documents the flag, range, and default.
- Unit tests cover: default applied, valid value passed through, out-of-range rejected, non-integer rejected.

## Notes

Keep standalone unless triage decides to bundle with `cli-drop-writes-to-raw-status-command` — they touch the same CLI surface but solve independent problems.

Origin: reflection from cycle 0019 (`docs/cycle/0019-feature-cli-cycle-drop-writes-to-raw-not-tbd/REFLECTION.md`).
