Both REVIEW.md and MUST-FIX.md need write permission to `docs/cycle/0149-feature-codify-filter-length-1-cardinality-conve/`. Can you approve writes to that directory?

In the meantime, here is the MUST-FIX content (1 task):

---

**MUST-FIX: Cycle 0149**

**1 minor issue, 0 critical issues.**

### Task 1 (Unbacked Doc Claim): Fix `.cycle/.env` loading claim in CLAUDE.md

**Priority:** Minor  
**Doc:** `CLAUDE.md:10`  
**Claim prose:** "Any repo needing trunk mode: create `.cycle/.env` with `CYCLE_TRUNK_BASED=1`, or pass `--trunk` to `cycle run`."  
**Expected backing:** code that reads/sources `.cycle/.env` at engine startup  
**Actual state:** No such code exists. `CYCLE_TRUNK_BASED` is only set via `if (args.trunk) process.env.CYCLE_TRUNK_BASED = "1"` at `src/cli.ts:96`. Nothing loads `.cycle/.env` in `src/`, `dist/`, or any shell wrapper.

**Fix (two options — pick one):**

*Option A — Delete the `.cycle/.env` instruction (correct today's behavior):*
Edit `CLAUDE.md:10` to remove "create `.cycle/.env` with `CYCLE_TRUNK_BASED=1`, or" so the line reads:
> Any repo needing trunk mode: pass `--trunk` to `cycle run`.

*Option B — Add `.env` file loading to back the claim:*
In `src/cli.ts`, before the `args` parse, add:
```ts
import { readFileSync } from "node:fs";
try {
  const env = readFileSync(".cycle/.env", "utf8");
  for (const line of env.split("\n")) {
    const [k, v] = line.split("=");
    if (k && v !== undefined) process.env[k.trim()] = v.trim();
  }
} catch {}
```
Then verify `CYCLE_TRUNK_BASED=1` in `.cycle/.env` correctly activates trunk mode without `--trunk`.

**Verify:** `grep -n "\.cycle/\.env" CLAUDE.md` returns the updated line (Option A: no mention; Option B: now backed by the new loading code at `src/cli.ts:NN`).

---

Once you approve writes I'll persist both files to disk.
