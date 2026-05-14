// Dogfood-only helper: sync src/defaults/ → .cycle/ after a cycle modifies
// the defaults in this repo. Normal consumers don't need this — cycle never
// touches their .cycle/ during a run. Here in the cycle repo, src/defaults/
// IS the source of truth for what later ships into .cycle/ via init, so the
// two can drift mid-cycle.
//
// Divergence guard: each run records a sha256 of every src/dst pair into
// .cycle/.sync-state.json. A destination whose current sha matches neither
// the recorded dst_sha256 nor the current src_sha256 is "locally divergent"
// and is preserved (exit 2). `--force` or CYCLE_SYNC_DEFAULTS_FORCE=1
// overrides. See CLAUDE.md `### sync-defaults divergence guard` for the full
// contract.
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";

const SRC_ROOT = "src/defaults";
const DST_ROOT = ".cycle";
const STATE_PATH = ".cycle/.sync-state.json";

const force =
  process.argv.includes("--force") || process.env.CYCLE_SYNC_DEFAULTS_FORCE === "1";

function toPosix(p) {
  return sep === "/" ? p : p.split(sep).join("/");
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch (err) {
    if (err && err.code === "ENOENT") return false;
    throw err;
  }
}

async function loadState() {
  let raw;
  try {
    raw = await readFile(STATE_PATH, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") return {};
    throw err;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    console.error(`warning: ignoring malformed ${STATE_PATH} (not an object)`);
    return {};
  } catch {
    console.error(`warning: ignoring malformed ${STATE_PATH}`);
    return {};
  }
}

async function writeStateAtomic(state) {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  const tmp = `${STATE_PATH}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`);
  await rename(tmp, STATE_PATH);
}

async function discoverPairs() {
  let entries;
  try {
    entries = await readdir(SRC_ROOT, { withFileTypes: true, recursive: true });
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }
  const pairs = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const parent = entry.parentPath ?? entry.path ?? SRC_ROOT;
    const fromAbs = join(parent, entry.name);
    const fromPosix = toPosix(fromAbs);
    if (!fromPosix.startsWith(`${SRC_ROOT}/`)) continue;
    const rel = fromPosix.slice(SRC_ROOT.length + 1);
    pairs.push({ from: fromPosix, to: `${DST_ROOT}/${rel}` });
  }
  pairs.sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
  return pairs;
}

// Legacy directory teardown: workflows.yml replaced the .cycle/workflows/
// directory shape. Removal is unconditional (directory removal, not a file
// overwrite — guard intentionally does not protect it).
await rm(join(DST_ROOT, "workflows"), { recursive: true, force: true });

const state = await loadState();
const pairs = await discoverPairs();
const skipped = [];
const forced = [];

for (const { from, to } of pairs) {
  const srcSha = await sha256(from);
  const dstExists = await fileExists(to);
  const dstSha = dstExists ? await sha256(to) : null;
  const recorded = state[to];
  const isDivergent =
    dstExists &&
    dstSha !== srcSha &&
    (recorded ? dstSha !== recorded.dst_sha256 : true);

  if (isDivergent && !force) {
    skipped.push({ to, reason: "locally divergent" });
    continue;
  }
  if (isDivergent && force) forced.push(to);

  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
  const newDstSha = await sha256(to);
  state[to] = { src_sha256: srcSha, dst_sha256: newDstSha };
  console.log(`synced ${from} → ${to}`);
}

await writeStateAtomic(state);

if (force && forced.length > 0) {
  console.error(
    `force: overwriting ${forced.length} divergent path(s): ${forced.join(", ")}`,
  );
}
if (skipped.length > 0) {
  for (const s of skipped) console.error(`skipped ${s.to} — ${s.reason}`);
  console.error(`${skipped.length} path(s) skipped`);
  process.exit(2);
}
