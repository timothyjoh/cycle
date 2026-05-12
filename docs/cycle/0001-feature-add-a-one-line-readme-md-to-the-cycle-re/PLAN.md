# PLAN — Cycle 0001: One-line README

## Goal
Add `README.md` at repo root with a single sentence describing cycle, sourced from `BRIEF.md` framing.

## Files

### Create
- `/Users/timothyjohnson/wrk/cycle/README.md` — new file, 1–3 lines total.

### Modify
- None.

## Change Shape

Write a tiny markdown file. Two acceptable forms (per SPEC §"Success Conditions"):

**Form A (heading + line):**
```markdown
# cycle

An engine that turns issues into code changes — invoked by another agent or CI, runs one or more workflow cycles per issue, and lands branches and PRs.
```

**Form B (single line, no heading):**
```markdown
cycle is an engine that turns issues into code changes, invoked by another agent or CI to run scoped workflow cycles that produce branches and PRs.
```

Pick **Form A**. Heading aids GitHub render; body is the single load-bearing line. Phrasing must reflect BRIEF.md §Overview:
- "engine that turns work items into code changes"
- invoked by another agent (Claude Code/OpenClaw) or CI
- processes a queue of cycles, each → branch + PR

## Sequence
1. Read `BRIEF.md` §Overview (already done — lines 7–20) to lock phrasing.
2. `Write` `README.md` with Form A content.
3. Run acceptance check: `wc -l README.md` → expect 3 (heading, blank, line).
4. Visually confirm line matches BRIEF framing; no badges, TOC, install steps, examples.

## Validations
- `wc -l README.md` ≤ 3.
- `grep -c '^#' README.md` = 1 (only the H1, no sections).
- File contains no HTML tags, no links, no images.
- `git status` shows exactly one new file: `README.md`.
- `git diff --stat` shows no other paths touched.

## Risks / Resist
- **Scope creep**: temptation to add install (`npx @cycleai/cli init`), tech-stack, or usage. SPEC §"Out of Scope" forbids. Stop at one line.
- **Tone drift**: marketing copy. Stay factual, present tense (SPEC §Constraints).
- **Wrong framing source**: do not paraphrase from memory or package.json. BRIEF.md is authoritative.
- **Line length**: one sentence, not one visually-wrapped paragraph. Keep under ~200 chars so it reads as a line.

## Unknowns
- None blocking. Wording is a judgment call within BRIEF's framing — pick once, commit.

## Commit
Single commit: `docs: add one-line README describing cycle`. No co-author/AI trailer unless repo convention requires it (BRIEF/package.json show no such convention).

## Out of Scope (reaffirm)
No badges, TOC, install/usage, contributor guide, logo, screenshots, links section. No edits to `BRIEF.md`, `package.json`, source, or scripts.
