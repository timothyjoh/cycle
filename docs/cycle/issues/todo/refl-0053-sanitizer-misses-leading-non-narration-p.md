---
id: refl-0053-sanitizer-misses-leading-non-narration-p
title: Broaden artifact-sanitizer narration strip beyond `^(Now|Next|Here is|Output)\b` verb allowlist
workflow: feature
depends_on: [refl-0053-outer-fence-unwrap-skipped-when-prose-su]
triaged_at: "2026-05-14T19:27:41.122Z"
source: triage
---
## Problem

The artifact sanitizer added in cycle 0053 (`src/engine/sanitize-artifact.ts`, wired at the single artifact-write seam in `src/engine/run-cycle.ts`) is supposed to strip prompt self-narration from agent stdout before it lands on disk. Its narration regex was scoped to the canonical `^(Now|Next|Here is|Output)\b …` shape called out as the golden payload in cycle 0053's SPEC (`Now sync defaults…`). In practice, real prompt outputs lead with a much broader set of declarative verbs that none match.

## Evidence

Cycle 0053's own artifacts — written **through** the new sanitizer — still leak narration:

- `docs/cycle/0053-feature-strip-prompt-self-narration-and-stray-fe/REVIEW.md:1` opens:
  `Typecheck clean. 379/379 pass. Coverage 99.05/92.84/96.32. …`
- `docs/cycle/0053-feature-strip-prompt-self-narration-and-stray-fe/FIX.md:1` opens:
  `No MUST-FIX.md exists at …/MUST-FIX.md. …`

Neither line matches the four-verb allowlist, so the strip skips them and the prose ships unchanged. Same defect class, undetected.

A broader grep against committed cycle artifacts surfaces additional leak verbs in real prompt outputs: `Plan write.`, `Verified.`, `Typecheck clean.`, `No MUST-FIX.md exists.`, `Created …`, `Implemented …`, `Updated …`. All slip past the current regex.

## Suggested directions

Two options were sketched in the reflection; pick one (or a hybrid) during SPEC:

- **(a) Verb-allowlist broadening.** Extend `NARRATION_LINE` to an explicit allowlist of observed leak verbs (`Plan|Verified|Typecheck|No MUST-FIX|Created|Implemented|Updated|…`), seeded from a grep over committed `BUILD.md` / `REVIEW.md` / `FIX.md` / `VERIFY.md` / `COMMIT.md` artifacts under `docs/cycle/`. Low risk, but the list will keep growing as new prompts surface new opening verbs.
- **(b) Structural-cue strategy.** Flip the rule: drop everything before the first markdown structure marker (a `#` heading line OR a ``` ``` ``` fence) when that marker appears within the first ~5 lines and is preceded only by short prose. Generalises without an ever-growing verb list and matches the spirit of "strip prompt self-narration." Higher risk of mis-eating legitimate leading prose — needs explicit unit tests pinning the "no structure marker found ⇒ leave stdout alone" case so we don't silently truncate well-formed but unfenced agent output.

Option (b) is more durable; option (a) is the cheap, mechanical patch. SPEC step should resolve this choice and surface acceptance criteria covering both the four leak verbs from cycle 0053 evidence AND a passing-through case where the artifact already starts with `#` or ``` ``` ```.

## Coupling to sibling work

Sibling raw `refl-0053-outer-fence-unwrap-skipped-when-prose-su` touches the same module (`sanitize-artifact.ts`) and the same write-seam. Both fixes interact: option (b) above effectively subsumes part of the outer-fence-unwrap question (a leading fence becomes "the first structure marker" we anchor on). Sequence this child **after** the outer-fence-unwrap fix to minimize merge friction and let the structural-cue refactor (if chosen) build on the already-relaxed fence rule.

## Acceptance hints (for SPEC)

- Sanitizer strips all four real leak prefixes from cycle 0053 evidence (`Typecheck clean.`, `No MUST-FIX.md exists.`, `Plan write.`, `Verified.`).
- Sanitizer leaves untouched any stdout that begins with a `#` heading or a ``` ``` ``` fence on line 1.
- Unit tests in `src/engine/sanitize-artifact.test.ts` cover both new leak verbs and the pass-through case.
- Re-running the cycle 0053 dogfood scenario (or a fixture replay of those two artifacts) produces post-sanitize output whose first non-blank line is a structural marker, not narration.
- `npm run typecheck && npm test && npm run test:coverage` clean; `src/engine/sanitize-artifact.ts` coverage does not regress.
