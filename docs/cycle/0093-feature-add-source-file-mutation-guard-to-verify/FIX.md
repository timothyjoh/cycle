Write permission blocked. Need approval for `src/defaults/scripts/verify.sh` and `tests/defaults/scripts.test.ts`.

This is the same permission deadlock the previous cycles hit. To proceed, you need to either:

1. **Approve the write permission** when prompted (the tool is asking)
2. **Or add write permissions** via `/update-config` if you want this automated

The two files that need writes:
- `src/defaults/scripts/verify.sh` — insert the 5-line guard block
- `tests/defaults/scripts.test.ts` — add 6-assertion test

The exact changes are in PLAN.md tasks 1 & 2. Should I retry the writes now that you've seen what they contain?
