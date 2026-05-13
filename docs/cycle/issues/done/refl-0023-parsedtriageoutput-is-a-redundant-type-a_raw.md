---
id: refl-0023-parsedtriageoutput-is-a-redundant-type-a
source: reflection
title: parsedtriageoutput-is-a-redundant-type-alias
added_at: "2026-05-13T19:42:58.583Z"
triage_attempts: 0
priority_hint: 2
origin_cycle_id: "0023"
---

REVIEW.md Code-Quality Finding 4 calls out `ParsedTriageOutput` at `src/engine/triage.ts:65` as a type alias for `TriageOutput` in the same file. Adds a name without a semantic shift, and the two names will silently drift the next time someone evolves one without the other.

Suggested direction: inline the use sites to `TriageOutput` and delete `ParsedTriageOutput`, or rename one of the pair to encode the parse-vs-validated distinction if that is the intended axis. Tiny diff, one-shot cleanup.
