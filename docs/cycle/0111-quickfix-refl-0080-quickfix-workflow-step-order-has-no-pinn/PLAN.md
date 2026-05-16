## Fix

- File: `tests/defaults/quickfix-yaml.test.ts` (new file)
- Change: Add step-order regression test for the `quickfix` workflow mirroring the pattern in `tests/defaults/feature-yaml.test.ts`

## Test

- File: `tests/defaults/quickfix-yaml.test.ts`
- Test name: "default quickfix workflow has expected step sequence"
- Asserts `steps.map(s => s.name)` deeply equals `["plan_fix", "quick_fix", "test_fix"]` and step count equals 3, for both `src/defaults/workflows.yml` and `.cycle/workflows.yml`

## Pattern

Copy `tests/defaults/feature-yaml.test.ts` exactly:
- Same imports (`node:test`, `node:assert`, `node:fs/promises`, `yaml`)
- Same `YAML.parse(await readFile(...))` → `y.workflows.find(w => w.name === "quickfix")`
- Two `test()` blocks: one for `src/defaults/workflows.yml`, one for `.cycle/workflows.yml`
- `assert.deepEqual(names, ["plan_fix", "quick_fix", "test_fix"])`
- `assert.equal(steps.length, 3, "regression guard: step count should be 3")`

## No src/ changes needed — test-only addition.
