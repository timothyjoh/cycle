---
id: init-writes-cycle-package-json
source: text
title: "init: drop .cycle/package.json so the engine bundle loads in consumer repos"
added_at: "2026-05-22T20:05:00.000Z"
triage_attempts: 0
priority: high
---
## Context

`runInit` in `src/cli/init.ts` scaffolds `.cycle/bin/cycle.js` into a consumer repo but does not drop a `package.json` alongside the bundle. The bundle is ESM (`import` statements at the top), and Node decides ESM vs CJS by walking up from the file looking for the nearest `package.json` with `"type": "module"`.

In the cycle source repo itself this works incidentally: the root `package.json` declares `"type": "module"`, so the bundle at `.cycle/bin/cycle.js` is treated as ESM. In a fresh consumer repo (no enclosing `package.json`, or a `package.json` without `"type": "module"`) Node falls back to CJS and the bundle fails on its first line:

```
SyntaxError: Cannot use import statement outside a module
```

Reproduced today bootstrapping a new repo:

```
$ mkdir new-repo && cd new-repo && git init -b main
$ node /path/to/cycle/dist/cycle.js init
$ ./.cycle/bin/cycle.js --version
SyntaxError: Cannot use import statement outside a module
```

Workaround applied to that repo: hand-write `.cycle/package.json` with `{"type": "module"}`. After that, `./.cycle/bin/cycle.js --version`, `status`, and `triage --dry-run` all work as expected.

## Scope

- Extend `runInit` (`src/cli/init.ts`) to write `.cycle/package.json` with at minimum:
  ```json
  { "type": "module", "private": true }
  ```
- Scope is intentionally **only** `.cycle/` — do not touch the consumer repo's root `package.json` (it may not exist; if it does, it belongs to the user's own project).
- On `init --upgrade`, ensure the file is written if absent and left alone (or 3-way merged) if the user customized it.
- On `init --force`, overwrite per the existing force semantics.
- Add a test under `tests/cli/init.test.ts` (or wherever the init tests live) asserting the file is written and contains `"type": "module"`.

## Acceptance

- [ ] `cycle init` in a fresh empty directory produces a working `.cycle/bin/cycle.js` that boots under `node ≥ 22.6` with no shell environment hacks.
- [ ] `.cycle/package.json` is present after init and contains `"type": "module"`.
- [ ] Existing tests still pass; a new init test asserts the marker file exists.
- [ ] No change to consumer repo's root `package.json`.

## Notes

This bug only surfaces in *consumer* repos, never in cycle's own development repo — exactly the kind of self-hosting blind spot a release should catch. Worth filing under "fresh-init smoke test" as a recurring guard.
