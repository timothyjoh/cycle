---
id: refl-0019-rfc-001-raw-drop-example-priority-mismat
title: Reconcile RFC-001 raw-drop example priority with materializer default (3)
workflow: feature
depends_on: []
triaged_at: "2026-05-13T18:33:27.829Z"
source: triage
---
## Problem

`docs/RFC-001-issue-lifecycle.md` §"Raw drop" shows an example with `priority: 5` in the frontmatter. As of cycle 0019, `materializeFreeformIssue` emits `priority: 3` as the default (with 1–10 as the legal range, validated on the `--priority` flag).

Both values were intentional at the time — the RFC example was illustrative; the SPEC mandated `3` as the default and explicitly forbade an RFC edit to avoid scope creep. The result is that the canonical document and the canonical writer disagree at first read. A future contributor inspecting the RFC will assume `5` is the default.

This is doc-only; no code or behavior changes.

## Scope

Edit the RFC §"Raw drop" example so it stops misleading readers. Pick one of the two reconciliation strategies below (recommend (a) for clarity).

### Option (a) — recommended

- Change the example's `priority:` value from `5` to `3`.
- Add a one-line note immediately after the example block:
  > `priority` is an integer in the inclusive range 1–10; `3` is the default emitted by `cycle drop` when `--priority` is not given.

### Option (b)

- Leave the example at `5` but annotate it inline:
  > `priority: 5` here is illustrative only; the actual default emitted by `materializeFreeformIssue` is `3`. See `src/engine/materialize.ts`.

## Acceptance criteria

- [ ] `docs/RFC-001-issue-lifecycle.md` §"Raw drop" example no longer suggests `5` is the default.
- [ ] The chosen wording explicitly states the legal range (1–10) and the actual default (3), and points at the writer (`materializeFreeformIssue` / `cycle drop`).
- [ ] No other code, test, or workflow change in this cycle — doc-only.
- [ ] `npm test` still passes (sanity; should be a no-op since only an `.md` file changed).

## Non-goals

- Do not change the materializer default.
- Do not introduce a separate "RFC examples vs. defaults" section; a single inline note is enough.
- Do not touch other RFC sections for stylistic consistency unless they have the same priority-default ambiguity.
