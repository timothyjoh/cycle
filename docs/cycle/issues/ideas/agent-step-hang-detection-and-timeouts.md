---
id: agent-step-hang-detection-and-timeouts
source: manual
title: "Detect and recover from hung agent steps with configurable per-step timeouts"
added_at: 2026-05-27T17:03:38Z
priority: idea
---

## Problem

Some agent-backed workflow steps can appear to hang indefinitely. In practice, a `build` step sometimes runs for more than an hour even though the expected completion window is closer to 10–20 minutes.

This creates a bad AFK operator experience: cycle may look alive because the subprocess is still running, but no useful progress is happening and the lane is effectively blocked.

## Motivation

cycle already treats provider rate limits as a special wait/retry condition, but that does not cover ordinary hung steps:

- an agent CLI stalls without exiting;
- an agent process stops producing output;
- the model/tool backend gets stuck mid-turn;
- a build prompt enters a loop or waits for input;
- a shell/agent child process remains alive but makes no observable progress.

For release-quality AFK behavior, cycle needs a sane default ceiling and a way for workflows to tune it per model/agent/step. Different models and agents have different speed profiles, so a single global timeout may be too blunt.

## Initial proposal

Add configurable step timeout policy, probably in `.cycle/workflows.yml`.

Possible shape:

```yaml
engine:
  step_timeout_ms: 1800000 # default: 30 minutes

workflows:
  - name: feature
    steps:
      - name: build
        agent: claudecode
        timeout_ms: 1800000
      - name: review
        agent: claudecode
        timeout_ms: 900000
```

Resolution order could be:

1. step-level `timeout_ms`
2. workflow-level default timeout
3. engine-level default timeout
4. built-in fallback default

Suggested built-in defaults to discuss:

- ordinary agent artifact steps: 30 minutes
- `build` / `fix` / `test_build`: 45 minutes
- bash `verify`: maybe 20–30 minutes unless overridden
- rate-limit sleeps are not counted as hung-step timeouts because they are explicit engine pauses

## Better-than-timeout option to investigate

A timeout is the simplest guard, but it may not be the best diagnostic signal. The implementation should investigate whether cycle can detect a truly stalled step before killing it.

Possible signals:

- no stdout/stderr output for N minutes;
- no artifact file growth for N minutes;
- no child heartbeat/event from the agent wrapper;
- no git working-tree changes after a mutation step has been running for a long time;
- process is waiting on stdin / TTY prompt;
- provider-specific structured status, if available from an agent CLI;
- periodic subprocess health checks from `exec-spawn`.

The preferred design may combine both:

- **wall-clock timeout**: hard upper bound;
- **idle timeout**: shorter timeout when no output/progress occurs;
- **diagnostic event**: emit enough context to understand why the step was killed.

## Desired behavior

When a step exceeds its configured timeout or is judged hung:

1. terminate the child process tree cleanly if possible;
2. emit a structured log event, e.g. `step.timeout` or `step.hung`, with:
   - `cycle_id`
   - `step`
   - `agent`
   - elapsed time
   - timeout configuration source
   - last output timestamp if available
   - termination signal/result
3. mark the step as failed in the normal cycle failure path;
4. allow existing cycle retry behavior to decide whether to retry from a clean slate;
5. document how operators should tune timeouts for slower models or heavier repos.

## Questions to resolve

- Should this be called `timeout_ms`, `max_duration_ms`, or something else?
- Should timeout policy live under `engine`, per workflow, per step, or all three?
- Should there be separate `wall_timeout_ms` and `idle_timeout_ms`?
- Can `exec-spawn` reliably kill the entire child process tree across macOS/Linux/CI?
- Should bash steps and agent steps share the same timeout machinery?
- What counts as progress for artifact-producing steps?
- Should timeout failures be distinguishable from ordinary non-zero exit failures in queue/frontmatter?
- Should timeout retries have a separate max retry cap?

## Acceptance criteria draft

- Workflow config supports a configurable timeout for agent steps.
- Default timeout behavior prevents a `build` step from running indefinitely.
- Slow models/repos can override timeout values without patching source code.
- Hung/timeout termination emits structured events for operator diagnosis.
- Tests cover at least:
  - step exits before timeout → no timeout event;
  - step exceeds timeout → child is terminated and step fails;
  - step-level timeout overrides engine default;
  - timeout path does not corrupt queue/log state;
  - idle/no-output detection if implemented.
- Documentation explains defaults, tuning, and how to diagnose timeout vs provider rate limit vs ordinary failure.
