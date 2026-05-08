# Workflow Specification and Supporting Tooling

This document is the specification for the **workflow system that cycle itself should run**.

`BRIEF.md` captures the specification of the **cycle runner**. This document captures the specification of the **workflow system run by cycle**.

Cycle should support multiple workflows. This document primarily defines the preferred **default workflow**, starting from the workflow shape already established in **cc-pipeline**, then adapting it for issue-driven execution across brownfield and greenfield repos.

## Goal

Define the workflow system that cycle should execute for each issue, starting with the preferred default workflow.

Context: cycle is a planned rewrite of **cc-pipeline**, with the center of gravity shifted toward **issue-driven work** handled one issue at a time, typically from GitHub, Jira, Linear, or user-supplied issue files in the repo.

The default workflow should preserve what worked in cc-pipeline while adding the things cc-pipeline was weak at:
- issue-driven execution instead of BRIEF-driven project phases
- adaptive issue intake from multiple sources
- stronger repo awareness before and after edits
- better support for brownfield constraints and hidden coupling
- better audit artifacts per issue
- optional code intelligence and static analysis support

## Relationship to cc-pipeline

The starting point is not a blank slate.

cc-pipeline already defined a strong default execution shape:
- `spec → research → plan → build → review → fix → reflect → next → status → commit`

That is the baseline workflow shape to inherit conceptually.

The main change in cycle is not "invent a totally different workflow."
The main change is:
- the unit of work becomes an **issue** instead of a project phase
- future cycles can come from multiple intake sources instead of a single BRIEF-driven roadmap
- the workflow gains stronger **repo intelligence** around planning, implementation, and review

## Default Workflow

The preferred default workflow for a standard implementation issue is:

1. **triage**
2. **spec**
3. **research**
4. **plan**
5. **build**
6. **fallow** (or equivalent repo-intelligence guard step)
7. **impeccable** (Anthropic skill hardening / prompt-quality upgrade step)
8. **review**
9. **fix**
10. **verify**
11. **reflect**
12. **status**
13. **commit**
14. **pr**

Not every workflow must use every step, but this is the default path the system should be designed around.

## What Each Step Should Do

### 1. triage
Purpose:
- classify the issue
- decide whether it is best handled as `research`, `bug`, or `feature`
- decide whether the issue should be decomposed into multiple cycles
- identify likely code areas and risk level before full execution begins

Brownfield note:
Triage should not be only text classification. It should also make an early pass at repository-aware scoping.

### 2. spec
Purpose:
- restate the issue as an implementation-ready cycle objective
- define success conditions for this cycle
- narrow scope so the run does not sprawl

Artifact:
- `SPEC.md`

### 3. research
Purpose:
- inspect the current codebase state relevant to the issue
- identify existing patterns, modules, conventions, tests, and constraints
- understand how this repo already solves nearby problems

Artifact:
- `RESEARCH.md`

### 4. plan
Purpose:
- produce an actionable implementation plan grounded in both issue intent and codebase structure
- explain what files or modules are expected to change
- call out risks, unknowns, and validations to run

Artifact:
- `PLAN.md`

### 5. build
Purpose:
- implement the plan
- make the minimal coherent code changes needed for the cycle
- follow existing codebase patterns rather than freelancing a new architecture by accident

### 6. fallow
Purpose:
- run TypeScript-aware static analysis / code intelligence as a post-build guard before review
- inspect what the change actually touched, not just what the plan expected to touch
- map symbols, dependencies, module boundaries, and likely blast radius
- provide structural context that grep and naive semantic search miss

This step is named `fallow` here as a placeholder for the capability, not a permanent workflow step name.

Artifact candidates:
- `FALLOW.md`
- `repo-intelligence.json`
- injected summaries for downstream prompts

This step may later also be reused by other workflow stages as a shared capability.

### 7. impeccable
Purpose:
- apply an explicit prompt-quality and skill-hardening pass before human-style review
- strengthen the agent's execution framing, constraints, and quality bar using ideas inspired by Impeccable
- catch weak instructions, ambiguous success criteria, and under-specified validation before the workflow blesses the result

Why it exists:
- Anthropic's default impeccable skill is a good start, but likely too generic for cycle's issue-driven brownfield workflow
- cycle should have a place to tighten prompts and task framing after implementation reality is visible, not just at initial planning time
- this can improve downstream review quality and reduce shallow "looks fine" approvals

Reference:
- https://impeccable.style/

Artifact candidates:
- `IMPECCABLE.md`
- prompt deltas or validation checklists for downstream steps

### 8. review
Purpose:
- perform a staff-engineer-style review of the produced change
- inspect correctness, maintainability, fit with existing patterns, and likely regressions
- use repo intelligence when available to judge blast radius and hidden coupling
- incorporate any hardened criteria or prompt upgrades surfaced by the impeccable step

Artifact:
- `REVIEW.md`

### 9. fix
Purpose:
- address review findings
- resolve must-fix issues before verification and PR creation

### 10. verify
Purpose:
- run tests, linting, type-checking, and any architecture-relevant validations
- confirm the issue is actually solved, not just cosmetically edited

This step exists explicitly because brownfield work needs a stronger quality gate than pure greenfield exploration.

### 11. reflect
Purpose:
- capture what was learned during the cycle
- update the understanding of remaining work or newly discovered constraints
- record failures, surprises, and follow-on opportunities

### 12. status
Purpose:
- summarize what changed, what passed, what remains uncertain, and what the next human or machine should know

### 13. commit
Purpose:
- create the git commit(s) associated with the cycle

### 14. pr
Purpose:
- open the pull request and attach the cycle artifacts to the reviewable unit of work

## Why the Fallow Step Exists

A tool discussed in the Better Stack video, **"Fallow: The Code Intelligence Tool Every Claude User Needs"**, is a candidate for the repo-intelligence layer inside cycle.

Video:
- https://youtu.be/-lCfwIoDXq8

Why it matters:
- cycle should not rely only on grep-level understanding for TypeScript projects
- a code intelligence layer could improve triage, planning, build targeting, and review quality
- structural awareness is especially valuable in brownfield repos where local changes can have non-obvious effects

Desired uses inside the workflow:
- inspect what the build step actually changed
- trace symbol definitions and usages
- understand module boundaries and dependency chains
- surface likely blast radius for a change
- support review agents with architecture-aware context
- improve decomposition of large issues into smaller cycles
- act as a reusable guard capability for other steps later

## Brownfield Hazards the Workflow Must Account For

The default workflow should assume brownfield problems such as:
- hidden coupling across modules
- outdated or misleading issue descriptions
- stale or incomplete tests
- conflicting local conventions inside the same repo
- architectural drift between intended design and actual code
- unrelated failing tests or pre-existing repo damage

The workflow should respond by:
- researching existing patterns before proposing a fix
- using repo intelligence before implementation
- narrowing scope aggressively
- distinguishing pre-existing failures from introduced failures
- producing artifacts a human can inspect when the repo turns out to be messier than the ticket implied

## Repo Intelligence as a First-Class Input

Before or during build-oriented steps, cycle should ideally have access to:
- dependency graph
- key entry points
- test locations
- domain boundaries
- common change paths
- historical hotspots if available
- symbol relationships for TypeScript codebases

This intelligence may come from Fallow, another static-analysis tool, custom scripts, or cached project-specific analysis.

## Workflow Memory and Context Accumulation

Each cycle should accumulate learnings about the repo and workflow patterns so later cycles are less blind.

Desired capabilities:
- reusable findings from earlier cycles
- persistent notes on architecture hotspots
- recurring failure pattern capture
- known-risk areas by repo

Suggested stance for early versions:
- keep most intelligence per-cycle and artifact-based first
- add durable repo memory later once the file format and trust model are clear

## Near-Term Notes

Short term, this likely means:
- copy the proven cc-pipeline default workflow structure into cycle's workflow model
- adapt it to issue-driven intake rather than BRIEF-centric project phases
- add a repo-intelligence extension point around the default workflow
- evaluate Fallow for fit with cycle
- treat Fallow first as a post-build guard, with the option to reuse it in other stages later
- evaluate Impeccable as a workflow-native prompt-hardening step between structural analysis and review
- document how code intelligence output should be exposed to agents

## Open Questions

- Should `fallow` be a dedicated workflow step, or a capability consulted by several steps?
- Should `impeccable` be a dedicated step, or a mode layered into review/verify prompts?
- Is Fallow the right long-term tool, or just the first candidate?
- How much of Impeccable's value should be baked into default prompts versus exposed as an explicit artifact-producing phase?
- Should code intelligence run once per invocation, once per cycle, or continuously cached?
- How should intelligence outputs be stored: files, JSON artifacts, or prompt-injected summaries?
- What is the minimum useful integration for MVP-adjacent experimentation?

## Relationship to BRIEF.md

- `BRIEF.md` defines the runner, queue model, issue handling, branching, retries, and engine behavior.
- This document defines the workflow philosophy, workflow stages, and supporting tooling that the runner should execute.

A simple way to think about it:
- `BRIEF.md` = **how cycle operates as a system**
- `docs/WORKFLOW-SPEC.md` = **what workflow cycle should carry out on each issue**

## Conclusion

The point of cycle is not merely to run agents in order.
It is to run an issue-driven workflow that adapts to the repo and the source of incoming work.

The default workflow should inherit cc-pipeline's proven shape, then strengthen it with better issue intake, stronger verification, and code intelligence such as Fallow where that genuinely improves outcomes.
