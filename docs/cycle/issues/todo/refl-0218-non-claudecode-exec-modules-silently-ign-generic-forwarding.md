---
id: refl-0218-non-claudecode-exec-modules-silently-ign-generic-forwarding
title: Implement or document generic appendSystemPrompt forwarding for non-claudecode agents
workflow: feature
depends_on: [refl-0218-non-claudecode-exec-modules-silently-ign-runtime-warning]
triaged_at: "2026-05-21T10:49:17.934Z"
source: triage
parent: refl-0218-non-claudecode-exec-modules-silently-ign
---
## Problem

After the runtime warning lands, this issue addresses option (a) from the cycle 0218 reflection: investigate whether the codex, gemini, auggie, opencode, and pi CLIs support an equivalent system-prompt-append flag. Based on findings, either:

- **Forward generically** via `exec-spawn.ts` or per-module flag injection if a supported CLI flag exists, or
- **Document the gap** in `ENGINE.md` with per-agent status and annotate `ExecModule.runStep` with a JSDoc scope note.

## Acceptance criteria

- [ ] For each of the five agents, findings are recorded (flag supported / flag absent / unknown): either in the commit body or a `docs/` note.
- [ ] For each agent where a CLI equivalent exists: the exec module forwards `appendSystemPrompt` and a test asserts the flag appears in argv for `ARTIFACT_STEPS`.
- [ ] For each agent where no equivalent exists: `ENGINE.md` known-limitations entry names the agent and its status explicitly.
- [ ] `ExecModule` interface gets a JSDoc comment clarifying which agents honour `appendSystemPrompt`.
- [ ] No regression in existing exec tests.
- [ ] Coverage gates pass.

## Notes

Start by checking `exec-spawn.ts` for a generic injection point before falling back to per-module changes. Agents are registered in `exec.ts` via `resolveAgent`. The runtime warning from `refl-0218-non-claudecode-exec-modules-silently-ign-runtime-warning` provides coverage in the interim.
