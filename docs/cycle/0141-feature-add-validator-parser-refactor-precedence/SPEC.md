Permission needed to write SPEC.md. The content is ready — it specifies:

**Deliverable**: Edit `src/defaults/prompts/spec.md` to add a "Validator and parser refactor precedence" subsection + self-check instruction, then run `npm run sync-defaults`.

**Two modes documented**:
1. **Parity** — enumerate pre-refactor check order, require parity, add multi-violation fixture
2. **Carve-out** — declare "precedence-may-change", list non-dependent consumers with evidence

**Self-check**: catches "same order of checks" phrasing without enumeration or carve-out declaration, requires resolution before SPEC emits.

**Out of scope**: retroactive cycle 0050 re-pinning, triage.ts telemetry, RFC-001 edits, new TypeScript tests.

Please grant write permission to the artifact dir and I'll write SPEC.md.
