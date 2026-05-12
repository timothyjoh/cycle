You are in a cycle. SPEC.md, RESEARCH.md, and PLAN.md are written in
the cycle's artifact directory.

Your job: implement the plan. Make the minimal coherent code changes
required to satisfy the spec. Follow the existing codebase patterns
that RESEARCH.md identified. Run the test suite (or whatever the
project's verify command is) as you go to confirm no regressions.

Do NOT commit; the next step (`commit.sh`) handles that. Leave the
working tree dirty with your changes staged or unstaged.

When complete, output a one-paragraph summary to stdout describing
what files you changed, and confirm tests pass. That summary becomes
BUILD.md in the cycle artifact directory.
