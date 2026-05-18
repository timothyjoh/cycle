Need write permission granted. Once approved, I'll apply all 7 changes across 5 files. Here's the full changeset queued:

**`src/engine/triage.ts`** (4 changes):
- L31: `runAgent?:` → `runAgent:` (make required)
- L730: `async function runAgentViaDispatch` → `export async function runAgentViaDispatch`
- L160: `deps: TriageDeps = {}` → `deps: TriageDeps`
- L162: `deps.runAgent ?? runAgentViaDispatch` → `deps.runAgent`
- L270: `deps: TriageDeps = {}` → `deps: TriageDeps`
- L272: `deps.runAgent ?? runAgentViaDispatch` → `deps.runAgent`

**`src/cli/triage.ts`** (2 changes): add `runAgentViaDispatch` to import; pass `{ runAgent: runAgentViaDispatch }` at L46.

**`src/cli.ts`** (3 changes): add `runAgentViaDispatch` to import at L8; pass `{ runAgent: runAgentViaDispatch }` at both `runTriage` call sites (L107, L394).

**`tests/engine/triage.test.ts`** (3 changes): add `runAgentViaDispatch` to import; pass `{ runAgent: runAgentViaDispatch }` at L902 and L1367.

**`tests/engine/triage-dry-run.test.ts`** (2 changes): add `runAgentViaDispatch` to import; pass `{ runAgent: runAgentViaDispatch }` at L403.

Please approve writes to these files and I'll execute immediately.
