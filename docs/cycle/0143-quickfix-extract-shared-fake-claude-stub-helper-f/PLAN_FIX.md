Write permission pending. Here is the full PLAN for the fix agent:

---

**`docs/cycle/0143-quickfix-extract-shared-fake-claude-stub-helper-f/PLAN.md`**

```markdown
## Fix

### New file: `tests/engine/_helpers/fake-claude.ts`

- Import `SPEC_MIN_BYTES` from `../../../src/engine/run-cycle.ts`
- Define `SPEC_BODY`: realistic SPEC markdown ~311 bytes (heading + Problem + Acceptance sections)
- Module-level throw if `SPEC_BODY.length <= SPEC_MIN_BYTES` — pins floor at import time, no separate test file needed
- Export `FAKE_CLAUDE_BODY` = `"#!/bin/bash\ncat <<'EOF'\n" + SPEC_BODY + "EOF\n"` — for 19 standard sites
- Export `FAKE_CLAUDE_BODY_SUFFIX` = `"cat <<'EOF'\n" + SPEC_BODY + "EOF\n"` — for 2 sites that prepend a git-status command

### Edit: `tests/engine/run-cycle.test.ts`

- File: `tests/engine/run-cycle.test.ts:1`
- Change: add import `{ FAKE_CLAUDE_BODY, FAKE_CLAUDE_BODY_SUFFIX }` from `./_helpers/fake-claude.ts`

- 19 standard sites (lines 77, 119, 173, 225, 289, 339, 396, 440, 548, 641, 803, 863, 935, 997, 1173, 1241, 1438, 1527, 1574)
- Change: string `"#!/bin/bash\nyes FAKED | head -50\n"` → `FAKE_CLAUDE_BODY`

- 2 prefix sites (lines 1095, 1340)
- Change: template literal `...yes FAKED | head -50\n` → `...${FAKE_CLAUDE_BODY_SUFFIX}`

## Verification

- `grep -c 'yes FAKED' tests/engine/run-cycle.test.ts` → 0
- `grep -c 'echo FAKED' tests/engine/run-cycle.test.ts` → 0
- `npm test` passes

## Test

- File: `tests/engine/_helpers/fake-claude.ts`
- Test name: module-level assertion — throws at import if `SPEC_BODY.length <= SPEC_MIN_BYTES`, pinning stub body above floor whenever floor is raised
```

---

**Key decisions for the fix agent:**

- **Constant form** (`FAKE_CLAUDE_BODY`) chosen over function form: single canonical body covers 19/21 sites. Two sites need a `_SUFFIX` variant since they prepend a runtime `git status` command via template literal.
- **`SPEC_BODY`** uses a bash heredoc (`cat <<'EOF'`) so newlines are preserved without escaping. Emitted content is ~311 bytes — clears `SPEC_MIN_BYTES=200` with margin.
- **Regression pin**: module-level `throw` if body shrinks below floor — no new test file needed, caught at import time by any test that uses the helper.
- **tsconfig safe**: `tests/fixtures/**` is the only exclude; `_helpers/` is included.
