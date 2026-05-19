All verified. Here is the build output:

---

Implemented cycle 0149 across 4 files. Created `tests/helpers.ts` (11 lines) with the generic `expectExactlyOne<T>` helper using an internal `Record<string, unknown>` cast (no type constraint) — required because TypeScript 5.9 treats `Record<string, unknown>` index-signature types as not satisfying `{ event: unknown }` required-property constraints; the unconstrained generic still returns the correct inferred `T` at each call site. Updated `CLAUDE.md` (79 lines total) by inserting the `## Test conventions` section between "Coverage policy" and "Structural-invariants policy" documenting the `filter().length === 1` rule with cycles 0022/0051 rationale. Migrated `tests/cli/halt.test.ts`: added import, replaced 2 `find + assert.ok` sites (lines 122–123 and 190–191) with `expectExactlyOne`. Migrated `tests/engine/reflection.test.ts`: added import, replaced 6 `find` sites (lines 77–80, 112–115, 159–162, 182–184, 257–259, 357–359) with `expectExactlyOne`, removing all `assert.ok(summary)` guards and all `summary!.fields.*` non-null assertions. All PLAN.md tasks complete. Ran `~/.nvm/versions/node/v22.22.2/bin/node --experimental-strip-types --test`: **482 pass, 0 fail**. Ran `npm test:coverage` equivalent: **Line 98.40% ≥ 95%, Branch 91.66% ≥ 75%, Function 95.43% ≥ 90%**; all 7 per-file floors hold; coverage-gate and structural-invariants both exit 0. No TypeScript warnings. Deviation from PLAN: helper constraint changed from `T extends { event: unknown }` to unconstrained `<T>` with internal cast — same behavior, TypeScript 5.9 compatibility.

## Touched Files
- CLAUDE.md
- tests/helpers.ts
- tests/cli/halt.test.ts
- tests/engine/reflection.test.ts
