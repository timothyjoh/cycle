#!/usr/bin/env bash
# Helper sourced by commit.sh and pr.sh. Emits `Closes #N` lines for every
# https://github.com/<owner>/<repo>/issues/<N> URL in the cycle's issue file
# whose owner/repo matches the current repo slug. Deduplicates by <N>
# preserving first-occurrence order. Empty stdout when no matches.
#
# Usage: closes_block <issue_file_path> <owner_slash_repo>

closes_block() {
  local issue_file="${1:-}"
  local repo_slug="${2:-}"
  [ -n "$issue_file" ] || return 0
  [ -n "$repo_slug" ] || return 0
  [ -r "$issue_file" ] || return 0

  awk -v slug="$repo_slug" '
    {
      s = $0
      while (match(s, /https:\/\/github\.com\/[^[:space:]\/]+\/[^[:space:]\/]+\/issues\/[0-9]+/)) {
        url = substr(s, RSTART, RLENGTH)
        s = substr(s, RSTART + RLENGTH)
        n = split(url, parts, "/")
        if (n >= 7) {
          owner = parts[4]; repo = parts[5]; num = parts[7]
          if (owner "/" repo == slug && num ~ /^[0-9]+$/) print num
        }
      }
    }
  ' "$issue_file" | awk '!seen[$0]++ { print "Closes #" $0 }'
}
