---
id: txt-20260513-011632-commit-sh-pr-sh-include-closes-n-linkage
source: text
title: "commit.sh / pr.sh: include 'Closes #N' linkage when the cycle's issue body references a GitHub issue URL (e.g., 'https://github.com/<owner>/<repo>/issues/<N>'). Parse the issue body for one or more github.com issue URLs, append 'Closes #<N>' lines to the commit message body (not subject) and PR body. When PR merges, GitHub auto-closes those issues. Test: cycle whose issue body references issue #99 -> commit + PR include 'Closes #99'."
added_at: 2026-05-13T01:16:32.114Z
triage_attempts: 0
---

commit.sh / pr.sh: include 'Closes #N' linkage when the cycle's issue body references a GitHub issue URL (e.g., 'https://github.com/<owner>/<repo>/issues/<N>'). Parse the issue body for one or more github.com issue URLs, append 'Closes #<N>' lines to the commit message body (not subject) and PR body. When PR merges, GitHub auto-closes those issues. Test: cycle whose issue body references issue #99 -> commit + PR include 'Closes #99'.
