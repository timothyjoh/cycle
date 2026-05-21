---
id: refl-0216-scripts-verify-sh-nvm-path-injection-pre-fix-sync-defaults-nvm-divergence
title: "Fix sync-defaults always-exit-2: resolve NVM path divergence between .cycle and src/defaults"
workflow: feature
depends_on: []
triaged_at: "2026-05-21T09:43:38.100Z"
source: triage
parent: refl-0216-scripts-verify-sh-nvm-path-injection-pre
---
## Problem

`.cycle/scripts/verify.sh` contains four extra lines injecting `~/.nvm/versions/node/v22.22.2/bin` into PATH; `src/defaults/scripts/verify.sh` does not. Every `npm run sync-defaults` run exits 2, masking real failures and eroding trust in the tool's output. Documented as a known deviation in BUILD.md for cycle 0216.

## Root Cause

The local `.cycle/scripts/verify.sh` was patched with NVM path injection (to make it runnable on a machine where Node v22 is only accessible via nvm), but the patch was never back-ported to the canonical source at `src/defaults/scripts/verify.sh`.

## Resolution Paths

**Path A — Back-port to src/defaults:**

Add the same NVM v22 path injection to `src/defaults/scripts/verify.sh`. Choose this if:
- The injection is necessary for portability on machines where Node v22 is only accessible via nvm.
- The injection is idempotent and harmless on machines that already have Node v22 on PATH.

Note: CLAUDE.md says "If `node --version` < 22: `nvm use 22.22.2`", implying nvm is the expected fallback — this supports Path A.

**Path B — Add `.syncignore` mechanism to sync-defaults:**

Introduce a `.cycle/.syncignore` file listing paths that `scripts/sync-defaults.mjs` should skip during diff and copy operations. Choose this if:
- The NVM injection is intentionally local-only and should not ship to users.
- Other local overrides exist or are anticipated.

If taking Path B: update `scripts/sync-defaults.mjs` to read `.cycle/.syncignore`, skip listed paths in both the diff check and the copy step, and add tests covering ignore-list behavior.

## Acceptance Criteria

- `npm run sync-defaults` exits 0 after the fix is applied (or exits non-zero only for genuine unexpected deviations).
- **Path A:** `src/defaults/scripts/verify.sh` contains the NVM path injection; diff between `.cycle/scripts/verify.sh` and `src/defaults/scripts/verify.sh` is empty.
- **Path B:** `.cycle/.syncignore` exists listing `scripts/verify.sh`; `sync-defaults` skips listed files without treating them as divergences; tests added to `tests/sync-defaults.test.ts` covering ignore-list behavior; coverage gates pass.
- Full test suite passes with no regressions.
- Coverage gates (line ≥ 95%, branch ≥ 75%, function ≥ 90%) met; `scripts/sync-defaults.mjs` per-file floor (90%) maintained.
