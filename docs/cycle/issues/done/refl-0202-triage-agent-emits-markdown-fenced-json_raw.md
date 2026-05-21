---
id: refl-0202-triage-agent-emits-markdown-fenced-json
source: reflection
title: Triage agent emits markdown-fenced JSON in ~8% of calls; redesign-06 stranded in raw/
added_at: "2026-05-21T04:49:53.793Z"
triage_attempts: 1
priority_hint: 7
origin_cycle_id: "0202"
---

Across 209 triage invocations in `.cycle/log.jsonl`, 16 calls (~8%) returned JSON wrapped in markdown fences (`` ```json `` blocks) instead of raw JSON, producing parse errors. The 3-attempt retry budget is usually sufficient, but `redesign-06-final-fix-step` exhausted all three attempts and remains in `docs/cycle/issues/raw/` unprocessed.

This failure mode has persisted across many cycles. The triage prompt currently uses English instructions to emit raw JSON, but agents frequently add fences — especially after reasoning that references JSON structure. The current engine repair logic (`refl-0199-parse-error.md` style) does a trailing-prose strip but does not strip leading/trailing fence delimiters from the whole output.

Two complementary fixes: (1) add explicit negative instruction to the triage prompt: "Do NOT wrap output in markdown code fences or backtick blocks. Output the JSON object directly with no surrounding characters." (2) extend the engine's one-shot repair pass to detect and strip leading `` ```json `` / trailing `` ``` `` wrappers before the JSON parse attempt, which would convert these hard failures to soft-recovered successes without a retry.
