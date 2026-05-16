---
id: refl-0085-reflection-surfacing-does-not-dedup-agai
title: Add todo/blocked dedup gate to ingestReflection to suppress duplicate sharp-edge surfacing
workflow: feature
depends_on: []
triaged_at: "2026-05-16T02:34:11.560Z"
source: triage
---
## Problem

`ingestReflection` in `src/engine/reflection.ts` deduplicates within a single cycle run by scanning `log.jsonl` for prior `reflection.surfaced` ids. It has no cross-run visibility into `docs/cycle/issues/todo/` or `docs/cycle/issues/blocked/`.

When a permission-blocked build step false-positive succeeds (exit 0, zero source changes), the next reflection re-surfaces the same unfixed issue under a new `refl-<N>-*` id. Triage converts it to a second todo entry. With N false-positive cycles, the queue accumulates N unresolvable duplicates for the same fix — all blocked by the same root cause and none ever resolving because the underlying permission issue persists.

`refl-0084-dangerously-skip-permissions-still-absen` is already in `todo/`. Cycle 0085 reflection did not re-surface it, but only because the reflection author checked manually. The engine provides no automated guard.

## Fix Location

File: `src/engine/reflection.ts`  
Function: `ingestReflection`

## Implementation

Before writing any `raw/refl-*.md` for a sharp edge, add a dedup pass:

1. Read filenames from `docs/cycle/issues/todo/` and `docs/cycle/issues/blocked/`. Handle ENOENT gracefully (treat missing dir as empty set). For other read errors, emit `reflection.warning { reason: "dedup_read_error", dir, error }` and skip dedup for that dir (fail-open: better to surface a duplicate than suppress a valid new issue).

2. Build a Set of normalized slugs from existing filenames. Normalization: strip `.md` extension, lowercase the result, replace runs of non-alphanumeric characters with a single `-`, trim leading/trailing `-`.

3. For each candidate `sharp_edges` entry, compute its normalized title slug using the same normalization: `entry.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)`.

4. Check for collision: if any filename in the combined todo+blocked set, after normalization, **contains** the candidate's normalized title slug as a substring, suppress the entry. Emit `reflection.skipped { reason: "dedup", cycle_id, title: entry.title, matched_file: "<relative path of matching file>" }` instead of `reflection.surfaced`.

5. Keep the existing in-cycle dedup (log.jsonl scan for prior `reflection.surfaced` ids) unchanged. The new gate runs first.

## Acceptance Criteria

- `ingestReflection` reads `todo/` and `blocked/` listings; graceful ENOENT for both.
- A sharp edge whose normalized title slug matches (substring) any existing todo/blocked filename does not produce a `raw/refl-*.md` file.
- A suppressed entry emits `reflection.skipped { reason: "dedup", cycle_id, title, matched_file }` — not `reflection.surfaced`.
- A sharp edge with no matching filename IS written to `raw/` as normal.
- `reflection.summary` counts only unsuppressed (actually written) entries.
- Unit tests cover: (a) dedup suppression when `todo/` contains a matching filename, (b) pass-through when no filename matches, (c) ENOENT on `todo/` dir handled gracefully, (d) ENOENT on `blocked/` dir handled gracefully, (e) both dirs empty = no suppression.
- Existing in-cycle dedup tests remain green.

## Notes

- The substring check is intentionally loose: a todo file `refl-0084-dangerously-skip-permissions-still-absen.md` normalizes to `refl-0084-dangerously-skip-permissions-still-absen`; a candidate title `--dangerously-skip-permissions flag still absent from exec-claudecode.ts` normalizes to `dangerously-skip-permissions-flag-still-absent-from-exec-claudec`; the shared substring `dangerously-skip-permissions` triggers suppression. This handles the primary case without requiring exact title matching.
- Fail-open on read errors preserves the existing behavior: a transient EACCES on `todo/` should not silently suppress valid new issues.
- The `reflection.summary` event's `surfaced_count` must count only entries that were written, not suppressed ones; add a `suppressed_count` field if any were suppressed.
