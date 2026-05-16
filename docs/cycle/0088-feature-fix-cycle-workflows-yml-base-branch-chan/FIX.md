Both Edit and Write are blocked - the project's local settings override the global grants, restricting all non-listed operations. The cycle engine's bootstrapping catch-22 applies to interactive sessions in this directory too.

**To unblock, run this command in your terminal:**

```sh
cd /Users/timothyjohnson/wrk/cycle && node -e "
const fs = require('fs');
const p = '.claude/settings.local.json';
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
d.permissions.allow.push('Edit(/Users/timothyjohnson/wrk/**)', 'Write(/Users/timothyjohnson/wrk/**)');
fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
console.log('done');
"
```

Once that runs, reply here and I'll apply all 5 fixes immediately:
1. `exec-claudecode.ts:13` — `--dangerously-skip-permissions`
2. `run-cycle.ts` — `baseBranch?: string` in RunCycleOpts
3. `run-cycle.ts:127` — `opts.baseBranch ?? process.env.CYCLE_BASE ?? "main"`
4. `cli.ts:238` — `cfg.engine.base_branch`
5. `cli.ts:311,405` — `baseBranch: cfg.engine.base_branch` at both runCycle call sites
6. New test file `tests/engine/run-cycle.base-branch.test.ts`
