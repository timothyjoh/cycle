import { dirname, delimiter } from "node:path";

/**
 * Build a child-process env that guarantees `node` on the child's PATH
 * resolves to the same binary running cycle itself. Without this, bash
 * steps that invoke `npm test` / `node ...` can pick up a different Node
 * (e.g. system Node 20 vs the Node 22+ the project actually uses), and
 * scripts that rely on a flag like `--experimental-strip-types` fail
 * with a confusing exit code.
 *
 * The cycle CLI's own bundle (`./.cycle/bin/cycle.js`) is plain JS, so
 * it tolerates older Node at startup — but subprocess test runners do
 * not. Prepending the parent Node's bin dir to the child's PATH closes
 * that gap.
 */
export function buildChildEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const nodeBinDir = dirname(process.execPath);
  // If the caller supplied a PATH, honor it as the base (e.g. tests
  // that stub a fake CLI). Otherwise inherit from process.env.
  // Always prepend nodeBinDir — even if it's already present later in
  // PATH, an earlier match wins lookup, so position matters.
  const basePath = extra.PATH ?? process.env.PATH ?? "";
  const path = basePath
    ? `${nodeBinDir}${delimiter}${basePath}`
    : nodeBinDir;
  // Strip cycle-engine-internal vars so they don't bleed into arbitrary
  // subprocesses (bash steps, agents, verify scripts). They are re-injected
  // explicitly via cycleEnv when needed (e.g. CYCLE_BASE, CYCLE_ID).
  // CYCLE_TRUNK_BASED in particular causes test-suite contamination when
  // npm test is run as a bash step and inherits the engine's env.
  const { CYCLE_TRUNK_BASED: _t, ...baseEnv } = process.env as Record<string, string | undefined>;
  return { ...baseEnv, ...extra, PATH: path };
}
