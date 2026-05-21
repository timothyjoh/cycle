---
id: refl-0202-triage-agent-emits-markdown-fenced-json-prompt-fix
title: Add explicit no-fences instruction to triage prompt
workflow: feature
depends_on: []
triaged_at: "2026-05-21T04:55:25.342Z"
source: triage
parent: refl-0202-triage-agent-emits-markdown-fenced-json
---
## Problem

The triage agent wraps JSON output in markdown code fences in ~8% of calls. English-only instructions are insufficient -- agents frequently add fences after reasoning about JSON structure. The 3-attempt retry budget absorbs most cases but is not a reliable fix.

## Fix

Add explicit negative instruction to the triage system prompt immediately before or after the existing output contract description:

> Do NOT wrap output in markdown code fences or backtick blocks. Output the JSON object directly with no surrounding characters.

## Location

Triage system prompt in `src/engine/triage.ts` or the equivalent prompt template file.

## Verification

- `npm test` -- all tests pass.
- `npm run typecheck` -- no errors.
