503/503 pass, 0 fail. All coverage gates green. Overall: line 98.41%, branch 91.43%, func 92.83% — all above project floors (≥95% line, ≥75% branch, ≥90% func).

The test `"rejects --priority with no value"` now passes. The PLAN.md regex had the word order wrong — Node's actual error is `Option '--priority <value>' argument missing` (literal `argument missing` at end), not `missing.*argument`. Fixed regex: `/Option '--priority.* argument missing/i`. Full suite 503/503, coverage unchanged vs baseline (line 98.41% / branch 91.43% / func 92.83%).
