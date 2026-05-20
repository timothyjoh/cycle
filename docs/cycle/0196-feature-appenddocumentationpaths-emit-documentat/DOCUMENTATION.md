`docs/ENGINE.md` was already updated by the build step (it's in the diff). The SPEC explicitly excludes CLAUDE.md and README.md. The REFLECTION sharp edge is a test assertion gap — code, not documentation. No further doc edits needed.

Updated docs/ENGINE.md Documentation step section to note that `documentation.paths_appended { cycle_id, appended: string[] }` is emitted after a successful auto-append, and that no event fires when all touched paths were already listed — closing the audit-trail gap introduced by this cycle.
