#!/usr/bin/env bash
# Default verify script. Runs the test suite if a typical project file is present.
# Overridden per-repo when a project has a custom verify.
set -euo pipefail

# Ensure node v22+ is on PATH (engine may have been started with an older node)
_NVM_NODE="${HOME}/.nvm/versions/node/v22.22.2/bin"
[ -d "${_NVM_NODE}" ] && export PATH="${_NVM_NODE}:${PATH}"

if [ -f package.json ] && grep -q '"test"' package.json; then
  if [ ! -d node_modules ]; then
    npm install
  fi
  npm test
elif [ -f Cargo.toml ]; then
  cargo test
elif [ -f pyproject.toml ]; then
  pytest
else
  echo "verify.sh: no test runner detected; passing trivially"
fi
