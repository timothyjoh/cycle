`settings.local.json` only allows specific git operations and reads — Edit/Write ops on source files require user approval via the permission prompt. The prompts should be appearing for you to click "Allow."

If you're not seeing the prompts, you can either:

1. **Update `settings.local.json`** to allow Edit/Write during this build session, or
2. **Grant them interactively** — try the writes again and approve when prompted.

The three files I need to write to:
- `src/engine/run-cycle.ts` — add the spec byte-floor branch in `shouldSkipForArtifact`
- `tests/engine/run-cycle.skip-completed.test.ts` — fix seed at line 89 + add 3 new tests
- `CLAUDE.md` — update retry skip policy note

Should I retry the edits so the prompts appear?
