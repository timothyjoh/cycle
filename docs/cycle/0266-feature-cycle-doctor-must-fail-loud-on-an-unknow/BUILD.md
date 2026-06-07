All four new tests pass. Test suite exits 0; `src/cli/doctor.ts` coverage is 100%.

## Summary

This cycle makes `cycle doctor` / `cycle preflight` fail loud on an unknown or value-less `--workflow` name instead of silently degrading to a false `doctor: all checks passed`. Validation lives inside `runDoctor`, runs after config-load and before any preflight probing, and derives the available-workflows list from `cfg.workflows`. `src/cli/doctor.ts` (+33 lines): `DoctorOpts.workflow` is now optional (`workflow?: string`) — `undefined` ⇒ no flag ⇒ defaults to `feature` (unchanged path), `""` ⇒ value-less trailing flag ⇒ rejected with `doctor: --workflow requires a value — available workflows: …`, an unknown explicit name ⇒ rejected with `doctor: unknown workflow "<name>" — available workflows: …`; both return `{ stdout: "", stderr, exitCode: 1 }` before `runPreflight` runs. `src/cli.ts` (+5 lines, −1): the dispatch parser now maps a value-less trailing flag to `""` (distinct from no-flag `undefined`) instead of silently defaulting to `feature`. This completes PLAN.md Tasks 1, 2, and 4.

PLAN.md Task 3: `tests/cli/doctor.test.ts` (+82 lines) gains a second `e2e-tests`/`gemini` workflow in the fixture and four tests — unknown name (non-zero exit, stderr names the bad value + lists `feature`/`e2e-tests`, `stdout === ""`, no probe report, `.cycle/` unchanged via `readdir` snapshot), value-less flag (non-zero exit, `--workflow requires a value`, no `all checks passed`), no-arg default (omitted `workflow` ⇒ `feature` codex probe, exit 0), and valid explicit name (`e2e-tests` surfaces a `gemini` check, proving it resolved over the codex-only `feature` default). Docs: `CLAUDE.md` doctor row and `docs/doctor.md` (Usage + Exit codes) describe the new fail-loud behavior; `README.md` needed no edit (it does not enumerate doctor flag behavior).

Failure modes handled: malformed argv (value-less flag routed to a deterministic non-zero error, not a silent fallback); unknown workflow name (rejected before probing); config-load failure (existing try/catch preserved byte-for-byte, runs first so the available-names list is derivable). `runDoctor` still never throws — all rejections return a `DoctorResult`. The rejection paths spawn no probe and write no state (asserted by the unknown-name read-only test). The failure-path tests are the unknown-name and value-less-flag tests above. No deviations from PLAN.md.

Verify run: `npm test` — exit 0, all tests pass (the `cycle.end … status:"failed"` lines in output are intentional in-fixture log records, not test failures). Coverage: `npm run test:coverage` passed every gate; `src/cli/doctor.ts` 100.00% line ≥ 70% floor, `src/engine/preflight.ts` 99.22%, `src/engine/run-cycle.ts` 100% — no regressions, all structural invariants ok. `npm run typecheck` clean. No deferred work.

## Touched Files
- src/cli/doctor.ts
- src/cli.ts
- tests/cli/doctor.test.ts
- CLAUDE.md
- docs/doctor.md
- docs/ENGINE.md
