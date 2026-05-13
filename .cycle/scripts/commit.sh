#!/usr/bin/env bash
# Selectively stage the cycle's intended change surface and create one
# commit. Honors a hard denylist (.claude, dist, node_modules, *.lock,
# .cycle/cycle.pid, 160000 gitlinks). Residual untracked/modified paths
# are reported on stderr but never staged. CYCLE_ID + CYCLE_TITLE come
# from the engine.
set -euo pipefail

: "${CYCLE_ID:?CYCLE_ID must be set by cycle engine}"
: "${CYCLE_TITLE:?CYCLE_TITLE must be set}"

is_denied() {
  local p="$1"
  local q="${p%/}"
  case "$q" in
    .claude|.claude/*) return 0 ;;
    dist|dist/*) return 0 ;;
    node_modules|node_modules/*) return 0 ;;
    .cycle/cycle.pid) return 0 ;;
    *.lock) return 0 ;;
  esac
  return 1
}

gitlink_paths=$(git ls-files --stage 2>/dev/null | awk '$1 == "160000" { print $4 }' || true)
is_gitlink() {
  local p="$1"
  local q="${p%/}"
  if [ -n "$gitlink_paths" ]; then
    if printf '%s\n' "$gitlink_paths" | grep -Fxq -- "$q"; then
      return 0
    fi
  fi
  [ -e "$q/.git" ] && return 0
  return 1
}

while IFS= read -r line; do
  [ -z "$line" ] && continue
  xy="${line:0:2}"
  path="${line:3}"
  case "$xy" in
    R*|C*)
      path="${path##* -> }"
      ;;
  esac
  path="${path#\"}"
  path="${path%\"}"
  if is_denied "$path" || is_gitlink "$path"; then
    printf 'commit.sh: unstaged residual: %s\n' "$path" >&2
    git reset -q HEAD -- "$path" 2>/dev/null || true
    continue
  fi
  git add -- "$path"
done < <(git status --porcelain --untracked-files=all)

if git diff --cached --quiet; then
  echo "commit.sh: nothing to commit"
  exit 0
fi

# Auto-link any GitHub issues referenced in the cycle's issue body.
# shellcheck source=lib/closes.sh
. "$(dirname "$0")/lib/closes.sh"
issue_file=""
if [ -n "${CYCLE_ISSUE_ID:-}" ]; then
  for d in docs/cycle/issues/triaged docs/cycle/issues/queued; do
    if [ -f "$d/${CYCLE_ISSUE_ID}.md" ]; then issue_file="$d/${CYCLE_ISSUE_ID}.md"; break; fi
  done
fi
repo_slug="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
closes="$(closes_block "$issue_file" "$repo_slug")"

if [ -n "$closes" ]; then
  git commit -m "cycle ${CYCLE_ID}: ${CYCLE_TITLE}" -m "$closes"
else
  git commit -m "cycle ${CYCLE_ID}: ${CYCLE_TITLE}"
fi
git rev-parse HEAD
