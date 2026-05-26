#!/usr/bin/env bash
# Default verify script — intentionally strict. Missing dependencies are an
# operator problem, not a cycle problem. Replace with a repo-specific
# .cycle/scripts/verify.sh when these defaults do not fit your project.
set -euo pipefail

if [ -f package.json ] && grep -q '"test"' package.json; then
  if [ ! -d node_modules ]; then
    echo "verify.sh: node_modules/ not found. Run 'npm install' before starting cycle." >&2
    exit 1
  fi
  npm test
elif [ -f Cargo.toml ]; then
  cargo test
elif [ -f pyproject.toml ]; then
  if ! command -v pytest &>/dev/null; then
    echo "verify.sh: pytest not found on PATH. Install it before starting cycle." >&2
    exit 1
  fi
  pytest
else
  echo "verify.sh: no recognized test runner detected. Write a custom .cycle/scripts/verify.sh for this repo." >&2
  exit 1
fi
