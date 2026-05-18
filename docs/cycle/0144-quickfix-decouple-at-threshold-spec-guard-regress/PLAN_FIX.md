Write permissions are being blocked for that path. Here's the PLAN.md content — approve the write or I can try again:

```markdown
## Fix

- File: `tests/engine/run-cycle.spec-guard.test.ts:139-143`
- Change: Replace the at-threshold stub with one that explicitly emits 200 bytes (199 x's + literal newline via `printf '%s\n'`), removing the implicit dependency on `sanitizeArtifactStdout`'s trailing-newline append at `src/engine/sanitize-artifact.ts:17`.

Specifically, change:
```ts
// 199 x's + (sanitizer appends '\n') = 200 bytes exactly.
const payload = "x".repeat(199);
const { root, bin } = await setupRepo(
  noBranch,
  `#!/bin/bash\nprintf '%s' '${payload}'\n`,
);
```
to:
```ts
// 200 bytes: 199 x's + explicit newline. Does not rely on sanitizer append.
const payload = "x".repeat(199);
const { root, bin } = await setupRepo(
  noBranch,
  `#!/bin/bash\nprintf '%s\\n' '${payload}'\n`,
);
```

`printf '%s\\n'` (bash: `printf '%s\n'`) emits 199 x's + newline = 200 bytes from the stub itself.

## Test

- File: `tests/engine/run-cycle.spec-guard.test.ts`
- Test name: existing `spec-guard [branch]: at-threshold payload passes` and `spec-guard [no-branch]: at-threshold payload passes` — both must still pass with `st.size === SPEC_MIN_BYTES` (200).
- No new test needed; the fix is self-contained in the existing parametrized test at line 138.
```

**One-char change in the stub**: `printf '%s'` → `printf '%s\n'`. Sanitizer still processes the output (strips trailing ws, re-appends `\n`), but the 200-byte arithmetic no longer silently depends on the sanitizer's append being the sole source of the final byte.
