741 tests pass, 0 failures. The null guard fix is applied and verified.

## Summary

**Fix 1 applied** (`FINAL_FIXES.md` task 1/1): Added null guard in `src/engine/frontmatter.ts` line 14.

Before:
```ts
const fm = YAML.parse(m[1]) as Frontmatter;
```

After:
```ts
const fm = (YAML.parse(m[1]) as Frontmatter) ?? {};
```

This restores the prior behavior of the hand-rolled parser for the empty-frontmatter edge case: `YAML.parse("")` returns `null`, which the `??` operator now coerces to `{}`, preventing `TypeError: Cannot read properties of null` for callers accessing `fm.id` or other fields.

**Test suite outcome**: 741/741 passing, 0 failures.
