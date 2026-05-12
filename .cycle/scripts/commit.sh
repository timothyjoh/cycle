#!/usr/bin/env bash
# Stage everything and create a single commit. Cycle ID + title come
# from CYCLE_ID / CYCLE_TITLE env vars set by the engine before
# invoking this script.
set -euo pipefail

: "${CYCLE_ID:?CYCLE_ID must be set by cycle engine}"
: "${CYCLE_TITLE:?CYCLE_TITLE must be set}"

git add -A
if git diff --cached --quiet; then
  echo "commit.sh: nothing to commit"
  exit 0
fi
git commit -m "cycle ${CYCLE_ID}: ${CYCLE_TITLE}"
git rev-parse HEAD
