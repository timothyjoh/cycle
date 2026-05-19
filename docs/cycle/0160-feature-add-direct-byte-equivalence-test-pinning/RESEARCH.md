Research doc written to `docs/cycle/0160-feature-add-direct-byte-equivalence-test-pinning/RESEARCH.md`.

Key findings for the planner:

1. **Both call sites share `materializeFreeformIssue`** — `drop` at `src/cli.ts:86` passes `args.priority`; `run` at `:92` passes nothing (always defaults to 3).

2. **`run` has no `--priority` flag** — `parseArgs` for `run` defines no `priority` option. Passing `--priority 2` to `run` would throw. The SPEC's acceptance criteria are internally inconsistent here. The resolution is to use default priority (3) for both invocations — no `--priority` flag needed.

3. **Raw file path acquisition differs by command** — `drop` stdout gives `{ path }` directly; `run "<text>" --dry-run` stdout is NDJSON events, so the raw file must be found via `readdir(rawDir)`.

4. **Frontmatter byte shape is fully pinned** (cycle 0159 landed) — the mandatory blank line between `---` and body is `"---\n\n"` in both test files.
