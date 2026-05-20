---
id: refl-0194-no-structural-invariant-enforcing-regist
source: reflection
title: no structural invariant enforcing REGISTRY / Step.agent union / exec-file consistency
added_at: "2026-05-20T03:34:17.718Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0194"
---

The agent fleet is now five entries (claudecode, codex, gemini, auggie, opencode). All three components must be kept in sync: an `exec-<agent>.ts` export, a `REGISTRY` entry in `exec.ts`, and `"<agent>"` in the `Step.agent` union in `workflow.ts`. There is no build-time check enforcing this — `structural-invariants.mjs` only checks two `triage.ts` patterns.

A partial registration (e.g. REGISTRY entry present but Step.agent union not widened, or vice versa) would compile and only fail at runtime when a workflow step with that agent is executed. cycle 0192 discovered this exact gap for `gemini` (registered in REGISTRY but absent from `Step.agent` union). As the fleet grows, the manual consistency requirement compounds.

Suggested direction: add invariants to `scripts/structural-invariants.mjs` that count the number of registered agents in `REGISTRY` (exec.ts), the number of string literals in `Step.agent` union (workflow.ts), and the number of `exec-*.ts` files in `src/engine/`, asserting all three match the same count.
