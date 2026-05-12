# SPEC — Cycle 0001: One-line README

## Objective
Add a `README.md` to repo root containing a single concise line describing what `cycle` is.

## Source Issue
`txt-20260512-222657-add-a-one-line-readme-md-to-the-cycle-re` — "add a one-line README.md to the cycle repo describing what cycle is"

## Deliverable
- New file: `/Users/timothyjohnson/wrk/cycle/README.md`
- Content: single sentence (one line) naming the project and stating its purpose.
- Description sourced from `BRIEF.md` (authoritative project framing).

## Success Conditions
- `README.md` exists at repo root.
- File contains exactly one line of meaningful prose (optional leading `# cycle` heading permitted, but body = one line).
- Line accurately reflects cycle's purpose per `BRIEF.md`.
- No other files touched.

## Out of Scope
- Installation instructions, usage examples, badges, TOC, contributor guide.
- Logo, screenshots, links section.
- Editing `BRIEF.md`, `package.json`, or any source.
- Multi-paragraph or multi-section README.

## Constraints
- One line only — resist expansion.
- Must be plain markdown; no HTML.
- Tone: factual, present tense.

## Acceptance Check
`wc -l README.md` returns a small number (≤3 if heading present, else 1); manual read confirms description matches BRIEF.md framing.
