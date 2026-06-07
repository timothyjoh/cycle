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
  # Running-app (e2e/integration) suite — Core thesis (BRIEF.md): verify must
  # drive the running app, not just its units. Runs only after units pass.
  # Precedence: explicit test:e2e script → e2e script → playwright/cypress
  # config via npx. Keys are matched anchored ("<key>":) so an unrelated script
  # whose name merely contains e2e is NOT matched. No suite detected ⇒ unit-only
  # (no output, no failure). A detected suite's non-zero exit fails verify via
  # set -euo pipefail — never swallowed; a missing runner is an operator problem.
  if grep -Eq '"test:e2e"[[:space:]]*:' package.json; then
    npm run test:e2e
  elif grep -Eq '"e2e"[[:space:]]*:' package.json; then
    npm run e2e
  elif compgen -G 'playwright.config.*' >/dev/null; then
    npx playwright test
  elif compgen -G 'cypress.config.*' >/dev/null; then
    npx cypress run
  fi
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
