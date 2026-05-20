**PASS — no MUST-FIX.md generated.**

Summary of all three passes:

**Pass 1 (Code Quality):** Clean 13-line exec module, correct REGISTRY entry, correct type union. Matches plan exactly. Typecheck clean.

**Pass 2 (Tests):** 556/556 pass. `exec-pi.ts` at 100% line/branch/function. Fake-binary approach is solid — no mock abuse. One minor shared pattern: single-flag tests (3 and 4) don't explicitly assert the absent flag is missing, but this matches the established codex/auggie/opencode pattern and is not a new regression.

**Pass 3 (Doc-vs-Code):** All 8 doc claims in `CLAUDE.md` and `docs/ARCHITECTURE.md` are backed by specific source lines. No unbacked claims.
