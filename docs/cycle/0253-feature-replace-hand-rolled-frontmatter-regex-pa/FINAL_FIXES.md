# Final Fixes — Cycle 0253

> Footprint: src/engine/frontmatter.ts, tests/cli/halt.test.ts, tests/engine/blocked.test.ts, tests/engine/frontmatter.test.ts

## Fix 1: parseFrontmatter casts yaml.parse null without a null guard

`YAML.parse("")` returns `null`, not `{}`. If an issue file has an empty frontmatter block (`---\n\n---\n`), `FM_RE` captures an empty string, `YAML.parse("")` returns `null`, and the `as Frontmatter` type assertion silently accepts it. Any caller that accesses `fm.id` (or any field) on the returned object will throw `TypeError: Cannot read properties of null`. The old hand-rolled parser returned `{}` in this case, so callers received `undefined` rather than a crash.

A one-line guard in `src/engine/frontmatter.ts` (already touched this cycle) restores the prior behavior: `const fm = (YAML.parse(m[1]) as Frontmatter) ?? {};`
