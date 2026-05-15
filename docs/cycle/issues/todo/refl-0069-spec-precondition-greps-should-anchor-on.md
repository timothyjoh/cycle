---
id: refl-0069-spec-precondition-greps-should-anchor-on
title: "SPEC-authoring rule: precondition greps over tbd.jsonl must anchor on `\"id\":\"<id>\"` (not free substring)"
workflow: feature
depends_on: []
triaged_at: "2026-05-15T20:13:40.480Z"
source: triage
---
## Context

Cycle 0069 SPEC.md AC #3 used a precondition gate of the shape:

```sh
grep failed-blocked-frontmatter .cycle/tbd.jsonl
```

The cycle's own queue row carried the literal phrase `failed-blocked-frontmatter` in its `title` field, so the loose substring grep returned `1` and would have aborted the disposition as a false positive — even though no live row with that **id** existed. BUILD silently narrowed the gate to `'"id":"failed-blocked-frontmatter"'` to satisfy the SPEC's *intent* without tripping it. REVIEW flagged the SPEC-authoring miss.

The root cause is a SPEC-authoring convention gap: free-substring greps over `.cycle/tbd.jsonl` collide with user prose in `title` fields, which routinely echoes the phantom id verbatim.

## Work

Adopt the convention that any precondition grep targeting an issue id MUST anchor on the JSONL field (or use `jq`). Two surfaces:

1. **CLAUDE.md / spec prompt note.** Add a short SPEC-authoring rule under the existing spec guidance: "When a precondition gates on an issue id in `.cycle/tbd.jsonl`, anchor on the `"id":"<id>"` substring or use `jq -e --arg id '<id>' 'select(.id==$id)'`. Never grep the raw id alone — `title` fields contain user prose and will false-positive."
2. **Optional lint helper.** Consider a small check that scans SPEC.md preconditions for the pattern `grep <token> .cycle/tbd.jsonl` and warns when `<token>` is also present in any current row's `title` field. Defer if the prompt-side note is enough.

Scope this cycle to the prompt-side note (CLAUDE.md addition + `src/defaults/prompts/spec.md` clause + `npm run sync-defaults`). File the lint helper as a follow-up reflection if the prompt change alone leaves a residual hole.

## Acceptance

- CLAUDE.md (or the spec.md prompt) carries a SPEC-authoring rule pinning the `"id":"<id>"`-anchored grep convention for `.cycle/tbd.jsonl` preconditions.
- A regression test pins the prompt clause (byte-equivalence between `src/defaults/prompts/spec.md` and `.cycle/prompts/spec.md`).
- Documentation step covers the new convention.

## Notes

- Origin cycle: 0069 (resolve dormant cycle-0027 debris stash).
- Priority hint: 4. Low-medium — convention drift, not a live correctness bug, but cheap to encode now.
- Sibling reflection from same cycle: `refl-0069-spec-ac-said-cycle-branch-but-dogfood-wo` (no_branch phrasing). Both are SPEC-prompt-quality fixes; can run independently.
