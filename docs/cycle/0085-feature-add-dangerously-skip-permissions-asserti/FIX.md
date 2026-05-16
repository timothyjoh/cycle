Permission blocked again — same bootstrapping issue. Need operator to approve write to `src/engine/exec-claudecode.ts` and `tests/engine/exec-claudecode.test.ts`.

Two exact changes needed:

**`src/engine/exec-claudecode.ts` line 13** — change:
```ts
const child = spawn("claude", ["-p", prompt], {
```
to:
```ts
const child = spawn("claude", ["-p", prompt, "--dangerously-skip-permissions"], {
```

**`tests/engine/exec-claudecode.test.ts` after line 22** — insert:
```ts
    assert.match(r.stdout, /--dangerously-skip-permissions/);
```

Please approve the write permissions so I can apply these. This is the fifth consecutive cycle blocked by the same `settings.local.json` permission override.
