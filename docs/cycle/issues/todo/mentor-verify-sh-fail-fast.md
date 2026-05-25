---
id: mentor-verify-sh-fail-fast
title: "verify.sh: replace auto-npm-install with fail-fast and clear operator message"
workflow: feature
depends_on: []
triaged_at: "2026-05-25T22:07:11.233Z"
source: triage
priority: medium
---
## Problem

`src/defaults/scripts/verify.sh` silently runs `npm install` when `node_modules/` is missing:

```bash
if [ ! -d node_modules ]; then
  npm install
fi
npm test
```

This is wrong in a factory context:

1. **Destructive side effect.** `npm install` mutates `node_modules/` and `package-lock.json` during a verification pass — polluting the commit surface tracked by `touched.json`.
2. **Slow.** A cold install adds 30–120s and stalls the queue.
3. **Network-dependent.** Silently fails in air-gapped environments.
4. **Wrong signal.** Missing `node_modules/` is an operator setup problem, not a cycle problem. Auto-installing masks it.

The same logic applies to implicit `pytest` availability in Python repos.

## Fix

Replace the auto-install block with fail-fast guards:

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

Update the top-of-file comment to state: this default is intentionally strict; operators are expected to replace it with a repo-specific `.cycle/scripts/verify.sh`.

## Files to touch

- `src/defaults/scripts/verify.sh` — apply the fix
- Run `npm run sync-defaults` to propagate to `.cycle/scripts/verify.sh`

## Acceptance Criteria

- [ ] `verify.sh` never calls `npm install` under any circumstances
- [ ] Absent `node_modules/` in a Node repo → exits 1 with actionable stderr message
- [ ] No recognized test runner → exits 1 directing operator to write a custom verify.sh
- [ ] `pytest` missing in a Python repo → exits 1 with actionable stderr message
- [ ] Happy paths still work: `node_modules/` present + `npm test`, `cargo test`, `pytest` on PATH
- [ ] `npm run sync-defaults` run; `.cycle/scripts/verify.sh` matches updated default
- [ ] All existing tests pass
