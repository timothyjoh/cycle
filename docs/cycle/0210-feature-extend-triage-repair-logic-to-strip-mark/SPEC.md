`★ Insight ─────────────────────────────────────`
When a cycle's source issue is filed before a fix lands, the spec becomes a verification spec rather than an implementation spec. The honest move is to scope the one real gap (prose-before-fence integration test in `triage-validator`) rather than re-implementing what's already done — keeps the cycle small and the commit meaningful.
`─────────────────────────────────────────────────`

SPEC written to `docs/cycle/0210-feature-extend-triage-repair-logic-to-strip-mark/SPEC.md`. Core fix already in place from cycles 0205–0206; cycle 0210 scopes to one missing integration test (prose-before-fence through `validateOutput`) plus full gate verification.
