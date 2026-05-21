---
id: refl-0216-scripts-verify-sh-nvm-path-injection-pre
source: reflection
title: scripts/verify.sh NVM path injection present in .cycle but absent from src/defaults — sync-defaults always exits 2
added_at: "2026-05-21T09:38:50.485Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0216"
---

`.cycle/scripts/verify.sh` contains four extra lines injecting `~/.nvm/versions/node/v22.22.2/bin` into PATH; `src/defaults/scripts/verify.sh` does not. This causes `npm run sync-defaults` to exit 2 on every run (`BUILD.md` for cycle 0216 documents this as a known deviation).

Two resolution paths: (a) back-port the NVM injection to `src/defaults/scripts/verify.sh` — correct if the injection is needed for portability on machines where node v22 is only available via nvm; (b) teach `sync-defaults` to skip files listed in a `.cycle/.syncignore` or similar — correct if the injection is an intentional local-only override that should not ship to users.

Until resolved, every `sync-defaults` run returns a non-zero exit code, which masks real failures and erodes trust in the tool's output.
