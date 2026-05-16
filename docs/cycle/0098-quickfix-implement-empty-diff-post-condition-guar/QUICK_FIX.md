Permissions blocked. Please approve writes to `src/engine/run-cycle.ts` and the new test file. Once approved, I'll apply all three changes. The full changes are:

**Change A** — `src/engine/run-cycle.ts` line 20, add before `writeFile` import:
```typescript
import { spawnSync } from "node:child_process";
```

**Change B** — after `formatSpecGuardError` (line 54), add:
```typescript
export const EMPTY_DIFF_GUARD_STEPS: ReadonlySet<string> = new Set(["build", "fix"]);
export function formatBuildGuardError(stepName: string): string {
  return `${stepName} post-condition failed: no code changes detected`;
}
```

**Change C** — replace the closing `}` of the spec `if` block (line 205) with an `else if` guard:
```typescript
          } else if (EMPTY_DIFF_GUARD_STEPS.has(step.name) && !wf.no_branch) {
            const diff = spawnSync("git", ["diff", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
            if (diff.status === 0 && !diff.stdout) {
              r.status = "failed";
              r.exitCode = r.exitCode || 1;
              r.stderr = formatBuildGuardError(step.name);
            }
          }
```

Can you approve write access to `/Users/timothyjohnson/wrk/cycle/src/engine/run-cycle.ts`?
