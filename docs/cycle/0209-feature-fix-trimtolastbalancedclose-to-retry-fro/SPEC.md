★ Insight ─────────────────────────────────────
`trimToLastBalancedClose` is file-private to `reflection.ts` — the issue incorrectly references `log-fmt.ts`. Adding `startOffset` keeps the fix contained without moving the function.
─────────────────────────────────────────────────

Spec written to `docs/cycle/0209-feature-fix-trimtolastbalancedclose-to-retry-fro/SPEC.md`.

Key scoping decision: the retry loop lives entirely in `parseWithRepair` — `trimToLastBalancedClose` just gets a `startOffset` param. This is the minimal change that carries the correct behavior forward when `refl-0208-triage-validateoutput-has-no-trimtolastb` extracts the shared utility later.
