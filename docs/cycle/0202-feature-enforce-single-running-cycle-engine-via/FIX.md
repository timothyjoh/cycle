Both tasks fixed. 576 tests pass, 0 fail. Coverage gates all green (engine-lock.ts at 100%).

**Task 1:** Added SIGTERM integration test — same slow-workflow + tbd.jsonl pattern as SIGINT, with `Promise.race` timeout. Extracted `slowWorkflowYml`, `todoFm()`, `queueRow()`, and `waitForLock()` helpers shared by both signal tests.

**Task 2:** Replaced the bare `child.on("exit")` promise in the SIGINT test with `Promise.race` against a 5-second timeout, matching the new SIGTERM test's pattern.

Coverage unchanged: Line 98.45%, Branch 92.38%, Function 92.89%.
