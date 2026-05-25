---
id: mentor-frontmatter-parser-use-yaml
title: "Replace hand-rolled frontmatter regex parser with yaml module to fix comma/quote/multiline bugs"
added_at: "2026-05-25T00:00:00.000Z"
source: mentor-review
triage_attempts: 0
priority_hint: 8
---

## Problem

`src/engine/frontmatter.ts` parses YAML frontmatter with a hand-rolled regex and a custom `parseScalar` that splits array values by commas with no escape handling. This produces silent data corruption when issue titles or bodies contain commas, quotes, or multi-line values.

Example: a title like `"Fix login, cookie, and session"` is incorrectly parsed as a three-element array instead of a string. This corrupts the `title` field that propagates through triage output, queue rows, commit messages, and artifact directory names.

The runtime already depends on the `yaml` package (`package.json` dependencies). There is no reason to maintain a fragile custom parser when a correct implementation is available.

## Fix

Replace the regex+`parseScalar` approach in `src/engine/frontmatter.ts` with:

```typescript
import { parse as parseYaml } from "yaml";

// In parseFrontmatter:
const fm = parseYaml(fmBlock) as Record<string, unknown>;
```

Keep the existing `stringifyFrontmatter` logic but use `yaml.stringify` for serialization so round-trips are lossless.

## Acceptance Criteria

- [ ] `parseFrontmatter` uses `yaml.parse` for the frontmatter block, not regex+`parseScalar`
- [ ] A title containing commas (e.g. `"Fix login, cookie, and session"`) is parsed as a string, not an array
- [ ] A title containing double-quotes parses correctly
- [ ] Multi-line frontmatter values parse correctly
- [ ] `depends_on: [id-a, id-b]` continues to parse as a string array
- [ ] `stringifyFrontmatter` produces valid YAML round-trippable by `parseFrontmatter`
- [ ] All existing frontmatter tests pass; new tests cover the comma/quote/multiline cases
- [ ] All existing tests pass with no regressions

## Risk

The `yaml` package is already a runtime dependency. This is a drop-in fix with no new dependencies.
