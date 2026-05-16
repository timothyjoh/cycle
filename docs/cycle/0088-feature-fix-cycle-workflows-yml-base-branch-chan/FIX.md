All write paths blocked — same catch-22. `exec-claudecode.ts` still lacks `--dangerously-skip-permissions`, so every spawned Claude subprocess hits the local settings wall.

**Manual break required.** Run this in your terminal:

```sh
cd /Users/timothyjohnson/wrk/cycle
node -e "
const fs = require('fs');
const p = '.claude/settings.local.json';
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
d.permissions.allow.push('Edit(/Users/timothyjohnson/wrk/**)', 'Write(/Users/timothyjohnson/wrk/**)');
fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
console.log('done:', d.permissions.allow);
"
```

After that, reply here and I'll apply all the fixes:

**Cycle 0087 unfinished (exec-claudecode.ts:13)**:
```ts
"--dangerously-skip-permissions",  // add as first arg
```

**Cycle 0088 Task 1 (run-cycle.ts:84-93, :127)**:
```ts
baseBranch?: string;  // add to RunCycleOpts
CYCLE_BASE: opts.baseBranch ?? process.env.CYCLE_BASE ?? "main",  // line 127
```

**Cycle 0088 Task 2 (cli.ts:238, :311-319, :405-412)**:
```ts
const base = cfg.engine.base_branch;  // line 238
baseBranch: cfg.engine.base_branch,   // both runCycle call sites
```

**Cycle 0088 Task 3**: new test file `tests/engine/run-cycle.base-branch.test.ts`
