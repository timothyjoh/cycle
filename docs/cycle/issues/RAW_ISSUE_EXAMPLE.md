# Raw Issue Example

This file documents the preferred shape for a work item that is ready to enter
`docs/cycle/issues/raw/` and be triaged by cycle.

It is an example, not an active issue. Do not move this file into `raw/`.

## What belongs in `raw/`

Use `raw/` for work that is ready for the engine to inspect, normalize into
one or more `todo/` items, and eventually execute. Source material can be messy
or copied directly from GitHub, Linear, Jira, a chat thread, or a human note —
but the more concrete the input, the less triage has to infer.

Minimum useful frontmatter:

```yaml
---
id: gh-123
source: github          # github | linear | jira | text | reflection | manual
source_url: https://github.com/org/repo/issues/123
source_id: "123"
title: "Fix Safari login redirect"
added_at: 2026-05-26T20:00:00Z
priority: medium        # low | medium | high | critical | discuss
---
```

Recommended body shape:

```md
## Problem

Safari users who log in from a deep link sometimes land on `/dashboard`
instead of the originally requested `next` URL.

## Acceptance Criteria

- [ ] Safari login preserves the `next` query parameter.
- [ ] Existing Chrome login behavior is unchanged.
- [ ] A regression test covers the redirect behavior.

## Context

Imported from GitHub issue #123. Customer report mentions Safari 17 and private
browsing, but the private-browsing part is not yet confirmed.

## Out of Scope

- Replacing the session system.
- Changing OAuth provider configuration.
```

## What triage normalizes

The raw issue is source material. During triage, cycle converts it into one or
more `todo/` files with engine-required fields:

- `id`
- `parent`
- `workflow`
- `title`
- `depends_on`
- `triaged_at`
- inherited `source`
- inherited/normalized `priority`
- enriched markdown body

The triage agent also chooses the workflow from the repo's configured
`workflows.yml`. That is where repo-specific categories belong: a repo can add
`bug`, `docs`, `quickfix`, `e2e-tests`, or any other workflow name, and triage
should route each child to one of those configured workflows.

## Thin or ambiguous inputs

If the work is not ready to execute, do **not** put it in `raw/` yet. Put it in
`docs/cycle/issues/ideas/` or mark it as `priority: discuss` so the engine parks
it for human judgment.

Examples of insufficient input:

```md
---
id: idea-auth
source: text
title: "fix auth"
priority: discuss
---

Something feels wrong with login. Need to talk through the actual symptom and
success criteria before cycle works on it.
```

Good triage should avoid turning vague prompts into confident implementation
work. The right path for thin input is clarification first, execution later.
