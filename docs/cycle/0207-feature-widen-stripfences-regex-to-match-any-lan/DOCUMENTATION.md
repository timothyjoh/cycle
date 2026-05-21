docs/ENGINE.md already correctly describes the widened regex — the "Known limitation" note was removed and replaced during the build step. CLAUDE.md's `log-fmt.ts` architecture entry (`stripFences(s)`) remains accurate. No other docs reference the fence-stripping regex pattern.

Updated docs/ENGINE.md Fence handling section: removed the "Known limitation" note describing the narrow `(?:json)?` pattern and replaced it with a unified paragraph describing the widened `/^```(?:\w+)?\r?\n/` regex that covers all LLM-emitted language tag variants (cycle 0207). No other doc files required changes.
