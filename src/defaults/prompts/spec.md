You are working on a cycle of code change inside a repo where the user
has dropped an issue into `docs/cycle/issues/queued/`.

The current cycle ID, workflow, and title are recorded in
`.cycle/log.jsonl`. The issue text is in the most recently moved
`docs/cycle/issues/queued/*.md` file (look at the YAML frontmatter
`id:` and the body for context).

Your job in this step: produce a one-page SPEC.md that restates the
issue as an implementation-ready cycle objective, defines success
conditions, and narrows scope so the run does not sprawl.

Output the SPEC.md content to stdout. Nothing else — no preamble,
no closing remarks, just the markdown body.
