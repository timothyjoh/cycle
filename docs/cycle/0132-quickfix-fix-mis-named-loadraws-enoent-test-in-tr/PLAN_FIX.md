Permission needed for that path. The plan is ready — here's what I found and the full PLAN content:

---

**Cycle 0132 — Fix: path (b)**

`loadRaws` at `triage.ts:325` is not exported but is trivially exportable — so path (b) is strictly better per the issue.

**Three changes:**

**Step 1** — `src/engine/triage.ts:325`
Add `export` to `loadRaws`: `async function loadRaws` → `export async function loadRaws`

**Step 2** — `tests/engine/triage.faults.test.ts:417`
Rename mis-titled test from `"fault: loadRaws ENOENT on raw/ directory returns empty set, runTriage resolves cleanly"` → `"fault: runTriage short-circuits cleanly when raw/ absent (ENOENT swallow via mkdir path, not loadRaws catch)"`. Add one-line comment: `// NOTE: ENOENT catch at triage.ts:330-332 is unreachable here — runTriage mkdir(rawDir) runs before loadRaws.`

**Step 3** — `tests/engine/triage.faults.test.ts` (after renamed test)
Add `loadRaws` to the import from `../../src/engine/triage.js`. Add new test `"fault: loadRaws returns empty set when rawDir does not exist (ENOENT catch)"` — calls `loadRaws("/nonexistent/path/that/will/never/exist")` directly, asserts result is `[]`. This directly exercises `triage.ts:330-332`.

Once you grant write permission to `docs/cycle/0132-*/PLAN.md`, I'll write it out.
