// Dogfood-only helper: sync src/defaults/ → .cycle/ after a cycle modifies
// the defaults in this repo. Normal consumers don't need this — cycle never
// touches their .cycle/ during a run. Here in the cycle repo, src/defaults/
// IS the source of truth for what later ships into .cycle/ via init, so the
// two can drift mid-cycle. Run this after editing src/defaults/* and before
// re-invoking cycle on this repo.
import { cp, rm } from "node:fs/promises";

const pairs = [
  ["src/defaults/workflows", ".cycle/workflows"],
  ["src/defaults/prompts", ".cycle/prompts"],
  ["src/defaults/scripts", ".cycle/scripts"],
];

for (const [from, to] of pairs) {
  await rm(to, { recursive: true, force: true });
  await cp(from, to, { recursive: true });
  console.log(`synced ${from} → ${to}`);
}
