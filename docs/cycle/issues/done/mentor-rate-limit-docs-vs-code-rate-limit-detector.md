---
id: mentor-rate-limit-docs-vs-code-rate-limit-detector
title: Add isRateLimitError shared helper to src/engine/rate-limit.ts
workflow: feature
depends_on: []
triaged_at: "2026-05-25T22:04:57.360Z"
source: triage
priority: medium
parent: mentor-rate-limit-docs-vs-code
---
## Problem

No shared utility exists to detect rate-limit signals from subprocess results. Each exec module currently treats rate-limit exits as ordinary failures.

## Task

Create `src/engine/rate-limit.ts` exporting:

```ts
export interface ExecResult {
  exitCode: number | null;
  stderr: string;
  stdout: string;
}

export function isRateLimitError(result: ExecResult): boolean
```

Detection logic:
- Exit code 429 (generic)
- Exit code 1 AND (stderr or stdout) contains `"rate limit"`, `"429"`, or `"Too Many Requests"` (case-insensitive) — covers Claude Code / Anthropic
- Same string patterns for Codex / OpenAI exit code 1

The function must be pure and have no side effects.

## Acceptance Criteria

- [ ] `src/engine/rate-limit.ts` created and exported
- [ ] `tests/engine/rate-limit.test.ts` covers: exit 429 detected, exit 1 + stderr "rate limit" detected, exit 1 + stderr "429" detected, exit 1 + stderr "Too Many Requests" detected, exit 1 + unrelated stderr NOT detected, exit 0 NOT detected
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] Coverage floors maintained
