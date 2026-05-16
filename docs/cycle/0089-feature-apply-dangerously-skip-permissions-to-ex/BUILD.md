Permission denied for source file edit. Need user to approve the write permission for this file. Please approve the Edit tool call for `/Users/timothyjohnson/wrk/cycle/src/engine/exec-claudecode.ts` when the prompt appears — or grant Write/Edit permissions to TypeScript files in `.claude/settings.local.json`.

The two changes needed are:

**`src/engine/exec-claudecode.ts` line 13** — change:
```ts
const child = spawn("claude", ["-p", prompt], {
```
to:
```ts
const child = spawn("claude", ["--dangerously-skip-permissions", "-p", prompt], {
```

**`tests/engine/exec-claudecode.test.ts` after line 22** — add:
```ts
    assert.match(r.stdout, /--dangerously-skip-permissions/);
```

Would you like to approve the edits via the permission dialog, or should I invoke the `update-config` skill to add Edit permissions for `src/**/*.ts` and `tests/**/*.ts` to `settings.local.json`?
