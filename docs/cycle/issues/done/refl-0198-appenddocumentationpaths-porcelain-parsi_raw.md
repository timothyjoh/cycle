---
id: refl-0198-appenddocumentationpaths-porcelain-parsi
source: reflection
title: appendDocumentationPaths porcelain parsing duplicated across pre and post loops
added_at: "2026-05-20T04:47:36.243Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0198"
---

Lines 67–78 (prePaths loop) and lines 88–98 (toAppend loop) in `appendDocumentationPaths` contain identical porcelain parsing logic: status-prefix extraction, R/C rename arrow extraction, and quote-strip. They exist as separate inline loops rather than a shared helper.

If the porcelain format handling ever needs to change — e.g., to handle space-in-filename edge cases, or git's `--porcelain=v2` format — both loops must be updated in sync. The current code makes this easy to miss since the loops are separated by the `spawnSync` call.

Suggested fix: extract a `parsePorcelainPath(raw: string): string | null` helper that both loops call. This matches the existing `truncateHeadCapped` extraction pattern in `log-fmt.ts`.
