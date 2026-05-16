PLAN.md written to `docs/cycle/0111-quickfix-refl-0080-quickfix-workflow-step-order-has-no-pinn/PLAN.md`.

Fix is a single new file: `tests/defaults/quickfix-yaml.test.ts`. Two test blocks, same pattern as `feature-yaml.test.ts`, assert step names equal `["plan_fix", "quick_fix", "test_fix"]` and count equals 3, for both `src/defaults/` and `.cycle/` mirrors. No src changes.
