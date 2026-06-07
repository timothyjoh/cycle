# Must-Fix Items: Cycle 0270

## Summary
1 critical issue, 0 minor issues found in review. The new manual `--workflow`
extraction in `parse-args.ts` only recognizes the space-separated form
(`--workflow <name>`); the equals form (`--workflow=<name>`), which the old
`node:util` `parseArgs` accepted and which therefore worked on master, now
falls through to `nodeParseArgs` as an unknown option and throws an **uncaught**
`Unknown option '--workflow'` error with a stack trace. This both (a) regresses
a previously-working invocation and (b) produces exactly the opaque crash this
cycle set out to eliminate — for `--workflow=feature` (valid) and
`--workflow=nonsense` (which should now get the loud rejection) alike.

## Tasks

- [x] ### Task 1 (Undeliverable User Benefit / AC#3 regression): Support the `--workflow=<value>` equals form in the run-path arg parser
  **Status:** ✅ Fixed
  **What was done:** Replaced the single `indexOf("--workflow")` extraction in
  `src/cli/parse-args.ts` with a two-branch detector — `findIndex(a =>
  a.startsWith("--workflow="))` for the equals form (value = substring after
  `--workflow=`; `--workflow=` ⇒ `""`) checked first, falling back to the
  existing space-form `indexOf("--workflow")` lookup, else `undefined`. The
  matched token (equals form: one element; space form: flag + value) is stripped
  from `nodeArgs` so neither falls through to `nodeParseArgs` as an unknown
  option. Added three parse-args unit cases (`--workflow=feature`,
  `--workflow=bug text`, value-less `--workflow=`) and two run-gate integration
  cases (`--workflow=nonsense` → exit non-zero, `run: unknown workflow
  "nonsense"`, no `engine.start`/`cycle.start`; `--workflow=feature` → passes
  gate, reaches `engine.start`).
  **Priority:** Critical
  **Files:** `src/cli/parse-args.ts` (extraction block at lines 57–61), `tests/cli/parse-args.test.ts`, `tests/cli/run-workflow-gate.test.ts`
  **Problem:** On master, `cycle run --workflow=feature` resolved `workflow:
    "feature"` and `cycle run --workflow=bug text` resolved `workflow: "bug",
    text: "text"` (the old `nodeParseArgs` with `workflow: { type: "string" }`
    accepts the `=` form). The new manual extraction uses
    `runArgv.indexOf("--workflow")` (`src/cli/parse-args.ts:58`), which matches
    only the exact token `--workflow`. For `--workflow=feature`: `wfIdx === -1`,
    so `workflowExplicit` is set to `undefined` (silently treated as flag-absent
    → would default to feature) **and** the unconsumed `--workflow=feature`
    token is passed to `nodeParseArgs`, which has no `workflow` option and
    **throws `Unknown option '--workflow'` uncaught**. `parseArgs` is called at
    `src/cli.ts:182` with no surrounding try/catch, so the process dies with a
    Node stack trace and a non-zero exit — not the loud, clean diagnostic the
    cycle promises, and a direct regression of SPEC AC#3 ("`cycle run
    --workflow feature` … any explicit valid workflow name must behave
    byte-for-byte as before"). Confirmed empirically: old parser →
    `workflow: feature`; new parser → `THREW: Unknown option '--workflow'`.
  **Fix:** In `src/cli/parse-args.ts`, before the existing space-form lookup,
    also detect the equals form and strip it from the args fed to
    `nodeParseArgs`. Replace lines 57–61:
    ```ts
    const runArgv = argv.slice(1);
    const eqIdx = runArgv.findIndex((a) => a.startsWith("--workflow="));
    const spaceIdx = runArgv.indexOf("--workflow");
    let workflowExplicit: string | undefined;
    let nodeArgs: string[];
    if (eqIdx >= 0) {
      // `--workflow=feature` ⇒ "feature"; `--workflow=` ⇒ "" (value-less,
      // rejected by the gate, consistent with the space form).
      workflowExplicit = runArgv[eqIdx].slice("--workflow=".length);
      nodeArgs = runArgv.filter((_, i) => i !== eqIdx);
    } else if (spaceIdx >= 0) {
      workflowExplicit = runArgv[spaceIdx + 1] ?? "";
      nodeArgs = runArgv.filter((_, i) => i !== spaceIdx && i !== spaceIdx + 1);
    } else {
      workflowExplicit = undefined;
      nodeArgs = runArgv;
    }
    ```
    Leave the rest of the function (the `nodeParseArgs` call and the return
    object) unchanged — `workflowExplicit`/`workflow` already flow correctly
    from there.
  **Verify:**
    - Add parse-args cases: `parseArgs(["run","--workflow=feature"])` ⇒
      `workflowExplicit === "feature"`, `workflow === "feature"`, does **not**
      throw; `parseArgs(["run","--workflow=bug","text"])` ⇒
      `workflowExplicit === "bug"`, `workflow === "bug"`, `text === "text"`;
      `parseArgs(["run","--workflow="])` ⇒ `workflowExplicit === ""` (value-less,
      gate-rejected); confirm the space forms still pass.
    - Add a run-gate integration case: `cycle run --workflow=nonsense
      --skip-preflight` exits non-zero with stderr `run: unknown workflow
      "nonsense"` and emits no `engine.start` (parity with the space-form test
      at `tests/cli/run-workflow-gate.test.ts:62`).
    - `npm test` green; `npm run typecheck` clean; coverage floors held.
