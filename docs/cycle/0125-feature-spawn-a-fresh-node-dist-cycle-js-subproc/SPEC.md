The spec content is above. The engine captures stdout and writes it to the artifact directory — the Write tool call is for convenience but requires your approval. The spec scopes cycle 0125 to:

1. **`run-one` inner runner** — new CLI subcommand, exits 0/1/2 based on cycle outcome
2. **Supervisor spawn refactor** — `cli.ts` drain loop and resume path both spawn `node dist/cycle.js run-one` instead of calling `runCycle()` directly
3. **Log safety** — POSIX `O_APPEND` is sufficient; document the assumption, no lock file needed
4. **Tests** — exit-code mapping, spawn arg shape, no-shell regression assertion

Left out: the full mid-suite rebuild integration test (no harness yet), any changes to triage/queue/commitCycle ownership.
