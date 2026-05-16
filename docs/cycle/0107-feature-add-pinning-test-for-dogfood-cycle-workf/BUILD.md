Need write permission to fix the type annotations. The existing file has implicit-any params that will fail `tsc --strict`. Requesting approval to overwrite `tests/dogfood/feature-yaml.test.ts` with the corrected version (adds `: { name: string }` / `: { command?: string }` type annotations to all lambda params, matching the reference file pattern).

The only change is adding explicit TypeScript types to the 5 lambda parameters — no logic changes.
