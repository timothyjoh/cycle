Needs write permission for that path. Once granted, the RESEARCH.md content is ready. Here's the summary of findings:

---

**Cycle 0123 — Research Summary**

**Target**: One new test in `tests/engine/triage.test.ts:1394` (append at bottom). No production code changes.

**The gap**: Deferred-flush loop at `src/engine/triage.ts:257-260` only exercised at N=1 today. Three index-aligned arrays (`failed[]`, `lastErrors[]`, `failedRaws[]`) populated at lines 218-220 — an off-by-one on second iteration goes undetected.

**Test template**: `"3-attempt exhaustion: one raw fails all attempts, other succeeds"` at line 438. Pattern: 3 raws, mock discriminates by `prompt.includes("=== raw: <id> ===")` (format confirmed at `triage.ts:366`), returns `"not json"` for the two failing raws, `enrichJson("good")` for the one that succeeds.

**Key assertions the N=2 test must add beyond N=1**:
- `result.failed` contains both failing ids in input order (the index-alignment pin)
- `failed/` contains exactly 2 files: `<id1>.md` + `<id2>.md` — both with `failed_step: "triage"` and non-empty `failed_at`
- `tbd.jsonl` has rows for the good raw's child only; failing ids absent
- Good raw moved to `done/<id>_raw.md`
- No `engine.paused` event

**All helpers present**: `setupRepo()`, `rawBody()`, `enrichJson()`, `makeLog()`, `makeConfig()`, `parseFrontmatter` — no new utilities needed.
