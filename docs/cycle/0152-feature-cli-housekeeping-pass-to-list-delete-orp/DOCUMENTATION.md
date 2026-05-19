Permission denied for `docs/ENGINE.md`. Two updates are needed but blocked:

1. **Line 7** — add `exec-spawn` to the engine module list (after `exec-bash`)
2. **Line 84** — change `provider-module non-zero exit in exec-claudecode.ts, exec-codex.ts, exec-gemini.ts` → `shared helper non-zero exit in exec-spawn.ts`

No other docs are stale — CLAUDE.md uses the `exec-*` wildcard (covers new file), README has no exec references, and `docs/plans/` is a historical doc not a living one.

Updated docs/ENGINE.md: added `exec-spawn` to the source-layout module list and updated the "Failed step.end stderr" emission-site (3) to name `exec-spawn.ts` as the new location of provider non-zero exit handling, replacing the stale per-module file references.
