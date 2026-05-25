---
id: mentor-verify-sh-fail-fast
title: "verify.sh: replace auto-npm-install with fail-fast and clear operator message"
added_at: "2026-05-25T00:00:00.000Z"
source: mentor-review
triage_attempts: 0
priority_hint: 7
---

## Problem

`src/defaults/scripts/verify.sh` runs `npm install` if `node_modules/` is missing:

```bash
if [ ! -d node_modules ]; then
  npm install
fi
npm test
```

This is wrong for a factory context:

1. **Destructive side effect in verification.** `npm install` modifies the working tree (`node_modules/`, `package-lock.json`) during what should be a read-mostly verification pass. This pollutes the commit surface tracked by `touched.json`.
2. **Slow.** A full `npm install` in a CI-cold repo takes 30–120s and blocks the queue.
3. **Network-dependent.** Fails silently in air-gapped or offline environments.
4. **Wrong signal.** If `node_modules/` is missing, the issue is the repo setup, not the cycle's change. Masking it with an install teaches the agent to ignore environment problems.

The same logic applies to the implicit assumption that `pytest` is installed for Python repos.

## Fix

Replace the auto-install block with a clear failure:

```bash
if [ -f package.json ] && grep -q '"test"' package.json; then
  if [ ! -d node_modules ]; then
    echo "verify.sh: node_modules/ missing — run 'npm install' in the repo before starting cycle" >&2
    exit 1
  fi
  npm test
elif [ -f Cargo.toml ]; then
  cargo test
elif [ -f pyproject.toml ]; then
  if ! command -v pytest &>/dev/null; then
    echo "verify.sh: pytest not found — install it before starting cycle" >&2
    exit 1
  fi
  pytest
else
  echo "verify.sh: no test runner detected — write a custom .cycle/scripts/verify.sh for this repo" >&2
  exit 1
fi
```

Also update the comment at the top to explain that the default is strict and customization is expected.

## Acceptance Criteria

- [ ] `verify.sh` does not run `npm install` under any circumstances
- [ ] When `node_modules/` is absent, exits 1 with an actionable message on stderr
- [ ] When no test runner is detected, exits 1 with a message directing the operator to write a custom verify.sh (not a silent pass)
- [ ] When `pytest` is not on PATH in a Python repo, exits 1 with a message
- [ ] Happy paths (node_modules present + npm test, cargo test, pytest installed) work as before
- [ ] `npm run sync-defaults` run so `.cycle/scripts/verify.sh` is updated
- [ ] All existing tests pass
