---
id: refl-0054-learning-mode-insight-blocks-leak-into-c-audit-suppress-output-style-propagation
title: Audit child-env + exec-claudecode for output-style propagation; suppress agent insight-block emission at source
workflow: feature
depends_on: []
triaged_at: "2026-05-14T19:53:31.183Z"
source: triage
parent: refl-0054-learning-mode-insight-blocks-leak-into-c
---
Cycle 0054 caught a `★ Insight ─────────────────────────────────────` decorative block in the middle of `docs/cycle/0054-…/FIX.md`. This is the Claude Code `learning` output style's insight marker leaking from the agent subprocess into a committed cycle artifact. The cycle-0053 artifact sanitizer (`sanitizeArtifactStdout` in `src/engine/sanitize-artifact.ts`) only strips leading narration prefixes (`^(Now|Next|Here is|Output)\b …`) and unwraps a single outer ``` fence — it has no notion of mid-document output-style decoration, so the insight block sails straight through.

Fix at the source: stop the agent subprocess from emitting the decoration in the first place. Defense in depth (sanitizer extension + CLAUDE.md contract) is tracked separately as the sibling child of this raw.

## Investigation

Audit two surfaces for output-style propagation into the spawned agent:

1. **`src/engine/child-env.ts`** — confirm the curated env handed to subprocesses does not carry any output-style-selecting variable (e.g. `CLAUDE_OUTPUT_STYLE`, settings dir overrides, anything that would resolve a non-default style in the child). If any output-style-flavored env leaks from the parent session, scrub it deterministically.
2. **`src/engine/exec-claudecode.ts`** — confirm the `claude` CLI invocation does not implicitly inherit settings from the parent session that would select `learning`. No `--output-style`, no `--settings` pointing at parent config, no settings dir auto-resolution that would pick up the operator's personal output style.

If the leak comes from either surface, suppress it: scrub the env var in `child-env.ts` AND/OR pass an explicit default-style flag on the `claude` invocation. Either fix is fine — pick the one that closes the leak with the smallest blast radius.

If the audit shows the leak is NOT propagation-driven (e.g. the agent's own prompt invites educational asides), document that finding and hand the fix off as a prompt-tightening note in the cycle reflection — but still cover the contract with a regression test that pins zero-decoration on the artifact path.

## Acceptance

- Root cause identified and recorded in BUILD.md (env var name + how it propagates, OR settings-inheritance path, OR prompt-side trigger).
- Source-side fix lands (env scrub or explicit flag) when the cause is propagation-based.
- Regression test in `tests/engine/exec-claudecode.test.ts` (or the closest existing exec test): spawns the agent under conditions that previously leaked the marker; asserts captured stdout contains no `★ Insight ─` substring.
- BUILD.md surfaces the exact marker bytes (U+2605 `★`, U+2500 `─`) and the open/close pattern so the sibling sanitizer cycle can encode them byte-exactly.

## Coordination

The sibling cycle `refl-0054-learning-mode-insight-blocks-leak-into-c-sanitize-insight-marker-blocks` depends on this work — it needs the confirmed marker pattern before extending the artifact sanitizer.

## Out of scope

- Extending `sanitizeArtifactStdout` (sibling cycle).
- Pinning the contract in CLAUDE.md (sibling cycle).
- Per-step audit of every artifact under `docs/cycle/0054/` for other leaks — verifying `fix` step is sufficient since all agent steps share the same exec path.
