<!-- DRAFT — for the cycle 0.2 release. Written to be edited; [EDITOR: …] marks
     spots to fill in (dates, exact numbers, links, voice). Nothing here is final. -->

# Cycle 0.2: building software you can trust a machine to ship

*[EDITOR: subtitle / date / author]*

An LLM can write a function. That's the easy 10%. The hard part — the part that
decides whether you can actually walk away and trust the result — is everything
around the code: working a backlog without drift, honoring a repo's conventions,
recovering from your own failures, and leaving a trail you can audit afterward.

**Cycle** is the layer that does that boring, repeatable mechanics. You hand it an
issue — a free-text task, a Jira card, a GitHub issue, a brief — and it runs a full
SDLC loop (spec → research → plan → build → review → verify → reflection →
documentation), committing reviewable changes and writing a paper trail as it goes.
One engine per repository, serialized on purpose, designed to be invoked by *something
else* — a CI job, a developer, or a higher-level orchestrator — and then left to run.

Cycle **0.2** is about making that trust real. The theme of the release is one idea:
**resilience is the precondition for autonomy.** You can't trust an away-from-keyboard
system over brittle output — but you *can* trust it over output that's specified,
reviewed, tested, and able to survive its own failures. So 0.2 hardens both halves:
the software cycle *produces*, and cycle's own execution.

---

## What's new in 0.2

### A multi-agent fleet, with per-step model selection
Cycle isn't tied to one vendor. Steps can run on any of a fleet of coding CLIs —
`claudecode`, `codex`, `gemini`, `auggie`, `opencode`, `pi` — and 0.2 adds a clean
way to configure them: a top-level `defaults: { agent, model, thinking }` block in
`workflows.yml`, with any step free to override. Model selection now actually reaches
the agents (including `--model` forwarding for the Claude and Gemini lanes). The
payoff is real resilience: if one provider rate-limits or goes down, you route a step
to another instead of waiting it out.

### Resilience by default
Cycle's shipped workflows now actively steer the agent toward building *resilient*
software, not just working software. Each step owns a slice of the discipline: the
spec step requires failure-mode acceptance criteria; the plan step demands idempotency
and observability decisions; review hunts for swallowed errors and fail-open defaults;
the test steps require failure-path coverage, not just the happy path. These are
*principles* shipped by default — explicit failure handling, idempotency, observability,
**no silent failure** — while heavier architectures (event sourcing, CQRS) stay opt-in
per project. *[EDITOR: this is the heart of the release — consider expanding.]*

### Durable execution: no silent success, no infinite hangs
Three fault-tolerance guarantees, drawn straight from how resilient systems are built:

- **Completion-proof contract** — a step that exits `0` but produced nothing (an empty
  artifact) is now a *failure*, not a silent pass. Exit code alone was too weak a signal.
- **Per-step timeout + salvage** — an agent process that finishes its work but hangs on
  exit no longer stalls the engine forever; a wall-clock timeout kills the process group
  and, if the work was actually complete, *salvages* it rather than discarding it.
- **Runaway guards** — an iteration-too-fast guard stops instant-failure retry loops, and
  a configurable cap bounds the rate-limit backoff loop.
- **Honest observability** — when a verify step fails, its output is now captured to the
  log, so you can see *why* without re-running by hand.

### Runs anywhere
Cycle now launches its agents with a permission mode that works in containers, CI, and
root environments out of the box — no `IS_SANDBOX` escape hatch required. And the test
suite is environment-portable: it passes on root and across Node 22/24/25, because
fault-injection no longer depends on `chmod` tricks or version-specific mocking.

### Smarter triage
Triage — which turns a thin issue into ordered, enriched work — now defaults to
*enrich-only* and resists over-decomposition. A "child" is one vertical slice that runs
the whole workflow, not a phase to be split into separate cycles.

---

## Built by cycle, on cycle

Here's the part we're proudest of: **much of 0.2 was built by cycle, working on its own
codebase.** We queued the features as issues and let the engine run — it specced,
planned, built, reviewed, tested, and committed them autonomously. Along the way its
reflection step *filed its own follow-up issues* and fixed them — including, memorably,
hardening a feature it had just built when it noticed the feature could silently swallow
an error. Resilience-by-default, applied recursively, by the machine, unattended.
*[EDITOR: insert the headline numbers — N autonomous cycles, M commits — once final.]*

That's the proof of the thesis in miniature: a process you can trust to deliver, because
it recovers from its own mistakes.

---

## Coming next: Maestro — a control plane for fleets of cycle

Cycle owns *one* repository lane by design. Real throughput comes from running many
lanes at once under a higher-level controller — and that controller is what we're
building next, in the open, **largely by pointing cycle at it.**

**Maestro** is an event-sourced control plane that manages a fleet of cycle engines
across many repositories. It holds a cross-repo issue backlog, supervises one engine
per repo, and schedules them so the fleet is *constantly building*. Its design pillars:

- **Event-sourced, end to end** — every state change is an immutable event; current state
  is a fold over the log. Durable execution and crash recovery fall out for free.
- **Point-in-time rewind** — because the whole fleet's history is an event log, you can
  reconstruct and inspect the exact state of every project as of any moment, and trace how
  it got there. Time-travel debugging for an autonomous software factory.
- **Repo-agnostic** — each managed repo is its own cycle instance with its own workflows;
  Maestro treats every engine as a black-box event source and makes no assumptions about
  how cycle is configured there.
- **Visualize, then converse** — the first milestone is *seeing* per-repo progress live;
  from there, creating issues across many projects at once and talking to a project-specific
  agent — or a top-level agent spanning the whole fleet.

Maestro is early — a proof of concept at the time of writing — but it's already doing the
thing that matters: cycle is building a complex, event-sourced system, with working
point-in-time rewind, on a repository it had never seen. *[EDITOR: link the maestro repo
when public; soften/strengthen "PoC" framing depending on its state at release.]*

---

## Get started

```sh
npx @cycleai/cli@latest init
# drop an issue, then:
./.cycle/bin/cycle.js run
```

*[EDITOR: install/links/CTA, changelog link, and a closing line. Confirm the 0.2 version
number and release date before publishing.]*
