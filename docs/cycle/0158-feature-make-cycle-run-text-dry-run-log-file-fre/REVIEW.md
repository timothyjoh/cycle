PASS. No MUST-FIX.md needed.

**Review summary:**

- 504/504 tests pass, 98.35% / 91.34% / 92.83% coverage, all per-file floors met, typecheck clean
- Core SPEC delivered: dry-run exits at `src/cli.ts:113`, before `createLogger` at line 116 — no log file written
- Tests use `expectExactlyOne` + ENOENT try/catch in both dry-run test scenarios
- All 7 SPEC acceptance bullets covered with PLAN.md traceability section present

Three minor observations (dead `cfg?` optional chain at :130, always-true `if (cfg)` guards at :135/:383, hardcoded `dry_run: false`) — all correct, all harmless residue from the relocation. No action required.
