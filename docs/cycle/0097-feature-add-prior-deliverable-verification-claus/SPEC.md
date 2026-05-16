Permissions needed to write the SPEC.md. Please approve the write to `docs/cycle/0097-feature-add-prior-deliverable-verification-claus/SPEC.md`.

`★ Insight ─────────────────────────────────────`
This spec uses the same pinning test pattern as `plan-prompt-spec-traceability.test.ts` — asserting both structural presence (section header, key phrases) and byte-identical parity. The parity test is what prevents silent drift; the structural tests are what make the parity meaningful (you know *what* must be in the identical copy).
`─────────────────────────────────────────────────`

The spec covers:
- **3 deliverables**: prompt edit, dogfood sync, pinning test
- **Key insight**: `.cycle/prompts/spec.md` is currently identical to the default (no divergence), so no sync-defaults complexity — direct copy after editing is sufficient
- **Self-applies**: the SPEC itself includes a `## Prior Deliverable Verification` section demonstrating the clause it proposes, showing the verification commands and outputs inline
