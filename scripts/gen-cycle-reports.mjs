#!/usr/bin/env node
// Generate per-cycle HTML reports from git history + cycle artifacts.
// Output: docs/cycle/reports/cycle-<NNNN>.html + index.html
// Each page: SPEC.md (top), code-only diff, REVIEW.md (bottom if present),
// prev/next pagination, dark mode.

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
const OUT_DIR = process.argv[2] || join(REPO_ROOT, "docs/cycle/reports");
const LIMIT = parseInt(process.argv[3] || "0", 10); // 0 = all
const CYCLE_DOCS = join(REPO_ROOT, "docs/cycle");

mkdirSync(OUT_DIR, { recursive: true });

// ---------- collect cycle commits ----------

const raw = execSync("git log master --pretty=format:'%h|%s' --grep '^cycle [0-9]'", {
  encoding: "utf8",
  cwd: REPO_ROOT,
});
const seen = new Set();
const cycles = [];
for (const line of raw.split("\n")) {
  const m = line.match(/^([a-f0-9]+)\|cycle (\d+):\s*(.*)$/);
  if (!m) continue;
  const [, sha, idRaw, title] = m;
  const id = idRaw.padStart(4, "0");
  if (seen.has(id)) continue;
  seen.add(id);
  cycles.push({ sha, id, title });
}
cycles.sort((a, b) => a.id.localeCompare(b.id));
const slice = LIMIT > 0 ? cycles.slice(0, LIMIT) : cycles;
console.log(`generating ${slice.length} report(s) → ${OUT_DIR}`);

// ---------- helpers ----------

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const findArtifactDir = (id) => {
  if (!existsSync(CYCLE_DOCS)) return null;
  const entry = readdirSync(CYCLE_DOCS).find((d) => d.startsWith(`${id}-`));
  return entry ? join(CYCLE_DOCS, entry) : null;
};

const readArtifact = (id, name) => {
  const dir = findArtifactDir(id);
  if (!dir) return null;
  const p = join(dir, name);
  if (!existsSync(p)) return null;
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
};

// Minimal markdown → HTML.
const mdToHtml = (md) => {
  if (!md || !md.trim()) return "";
  md = md.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const lines = md.split("\n");
  const out = [];
  let i = 0;
  let inCode = false;
  let codeLang = "";
  let codeBuf = [];
  let listType = null;
  let para = [];

  const flushPara = () => {
    if (para.length === 0) return;
    out.push(`<p>${inlineFmt(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };
  const inlineFmt = (s) => {
    s = escapeHtml(s);
    s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    return s;
  };

  while (i < lines.length) {
    const ln = lines[i];
    const fence = ln.match(/^```(\w*)$/);
    if (fence) {
      if (inCode) {
        flushPara();
        flushList();
        out.push(`<pre class="md-code"${codeLang ? ` data-lang="${codeLang}"` : ""}><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
        inCode = false;
        codeBuf = [];
        codeLang = "";
      } else {
        flushPara();
        flushList();
        inCode = true;
        codeLang = fence[1];
      }
      i++;
      continue;
    }
    if (inCode) {
      codeBuf.push(ln);
      i++;
      continue;
    }
    const h = ln.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      flushPara();
      flushList();
      const level = Math.min(h[1].length + 2, 6);
      out.push(`<h${level}>${inlineFmt(h[2])}</h${level}>`);
      i++;
      continue;
    }
    if (/^---+$/.test(ln)) {
      flushPara();
      flushList();
      out.push("<hr />");
      i++;
      continue;
    }
    const bullet = ln.match(/^[-*+]\s+(.*)$/);
    if (bullet) {
      flushPara();
      if (listType !== "ul") {
        flushList();
        listType = "ul";
        out.push("<ul>");
      }
      out.push(`<li>${inlineFmt(bullet[1])}</li>`);
      i++;
      continue;
    }
    const ordered = ln.match(/^\d+\.\s+(.*)$/);
    if (ordered) {
      flushPara();
      if (listType !== "ol") {
        flushList();
        listType = "ol";
        out.push("<ol>");
      }
      out.push(`<li>${inlineFmt(ordered[1])}</li>`);
      i++;
      continue;
    }
    if (ln.trim() === "") {
      flushPara();
      flushList();
      i++;
      continue;
    }
    if (listType) flushList();
    para.push(ln);
    i++;
  }
  flushPara();
  flushList();
  if (inCode) {
    out.push(`<pre class="md-code"><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
  }
  return out.join("\n");
};

const diffToHtml = (diff) => {
  const lines = diff.split("\n");
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  const out = [];
  for (const ln of lines) {
    let cls = "ctx";
    if (ln.startsWith("+++") || ln.startsWith("---")) cls = "meta";
    else if (
      ln.startsWith("diff --git") ||
      ln.startsWith("index ") ||
      ln.startsWith("new file") ||
      ln.startsWith("deleted file") ||
      ln.startsWith("rename ") ||
      ln.startsWith("similarity ") ||
      ln.startsWith("Binary files")
    )
      cls = "fileheader";
    else if (ln.startsWith("@@")) cls = "hunk";
    else if (ln.startsWith("+")) cls = "add";
    else if (ln.startsWith("-")) cls = "del";
    out.push(`<span class="${cls}">${escapeHtml(ln) || "&nbsp;"}</span>`);
  }
  return out.join("");
};

const EXCLUDES = [
  ":(exclude,glob)*.md",
  ":(exclude)docs",
  ":(exclude).claude",
  ":(exclude,glob)*.lock",
  ":(exclude)package-lock.json",
];
const exArgs = EXCLUDES.map((e) => `'${e}'`).join(" ");

const PAGE_CSS = `
  :root {
    --bg: #0d1117;
    --bg-elev: #161b22;
    --bg-soft: #1c2128;
    --fg: #e6edf3;
    --fg-muted: #8b949e;
    --fg-dim: #6e7681;
    --border: #30363d;
    --link: #58a6ff;
    --add-bg: #1a3826;
    --add-fg: #3fb950;
    --del-bg: #3d1418;
    --del-fg: #f85149;
    --hunk-bg: #0b2942;
    --hunk-fg: #79c0ff;
  }
  * { box-sizing: border-box; }
  body { font: 14px/1.55 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif; max-width: 1100px; margin: 0 auto; padding: 1.5rem; color: var(--fg); background: var(--bg); }
  a { color: var(--link); text-decoration: none; }
  a:hover { text-decoration: underline; }
  header { border-bottom: 1px solid var(--border); padding-bottom: 1rem; margin-bottom: 1.5rem; }
  h1 { font-size: 1.5rem; margin: 0 0 .3rem; }
  h3 { font-size: 1.1rem; margin: 1rem 0 .5rem; color: var(--fg); }
  h4 { font-size: 1rem; margin: .9rem 0 .4rem; color: var(--fg); }
  h5, h6 { font-size: .9rem; margin: .8rem 0 .3rem; color: var(--fg-muted); }
  .subtitle { color: var(--fg-muted); font-size: .95rem; }
  .meta-row { margin-top: .4rem; color: var(--fg-muted); font-size: .85rem; }
  .meta-row code { background: var(--bg-elev); padding: .1rem .35rem; border-radius: 3px; color: var(--fg); }
  nav.pager { display: flex; justify-content: space-between; align-items: center; margin: 1rem 0; padding: .5rem 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
  nav.pager a { padding: .35rem .6rem; border-radius: 4px; }
  nav.pager a:hover { background: var(--bg-elev); text-decoration: none; }
  nav.pager .disabled { color: var(--fg-dim); pointer-events: none; }
  nav.pager .center { color: var(--fg-muted); font-size: .85rem; }
  section { margin-bottom: 1.5rem; }
  section > h2 { font-size: .85rem; margin: 0 0 .6rem; color: var(--fg-muted); text-transform: uppercase; letter-spacing: .08em; font-weight: 600; }
  .scope-note { font-size: .8rem; color: var(--fg-dim); margin-bottom: .5rem; }
  .md p { margin: .5rem 0; }
  .md ul, .md ol { margin: .4rem 0 .4rem 1.5rem; padding: 0; }
  .md li { margin: .2rem 0; }
  .md code { background: var(--bg-elev); padding: .1rem .35rem; border-radius: 3px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85em; color: var(--fg); }
  .md pre.md-code { background: var(--bg-elev); border: 1px solid var(--border); padding: .9rem 1rem; border-radius: 6px; overflow-x: auto; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .8rem; line-height: 1.4; }
  .md pre.md-code code { background: none; padding: 0; font-size: inherit; }
  .md hr { border: 0; border-top: 1px solid var(--border); margin: 1rem 0; }
  .md table { border-collapse: collapse; margin: .5rem 0; }
  .md th, .md td { border: 1px solid var(--border); padding: .3rem .6rem; }
  pre.stat { background: var(--bg-elev); padding: 1rem; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .8rem; line-height: 1.4; overflow-x: auto; color: var(--fg); border: 1px solid var(--border); }
  pre.diff { background: var(--bg); padding: 0; border: 1px solid var(--border); border-radius: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .78rem; line-height: 1.4; overflow-x: auto; white-space: pre; margin: 0; }
  pre.diff span { display: block; padding: 0 1rem; }
  pre.diff .add { background: var(--add-bg); color: var(--add-fg); }
  pre.diff .del { background: var(--del-bg); color: var(--del-fg); }
  pre.diff .hunk { background: var(--hunk-bg); color: var(--hunk-fg); }
  pre.diff .fileheader { background: var(--bg-elev); color: var(--fg-muted); font-weight: 600; }
  pre.diff .meta { color: var(--fg-muted); }
  pre.diff .ctx { color: var(--fg); }
  .empty { background: var(--bg-elev); padding: 1rem; border-radius: 6px; color: var(--fg-muted); font-style: italic; border: 1px solid var(--border); }
  footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--fg-dim); font-size: .8rem; text-align: center; }
  footer code { background: var(--bg-elev); padding: .1rem .35rem; border-radius: 3px; }
`;

const renderPage = ({ sha, id, title, prevId, nextId, specMd, reviewMd, stat, diff, author, date, total }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Cycle ${id} · ${escapeHtml(title)}</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<header>
  <h1>Cycle ${id}</h1>
  <div class="subtitle">${escapeHtml(title)}</div>
  <div class="meta-row">
    <code>${sha}</code> · ${escapeHtml(author)} · ${escapeHtml(date)}
  </div>
</header>

<nav class="pager">
  ${prevId ? `<a href="cycle-${prevId}.html">← Cycle ${prevId}</a>` : `<span class="disabled">← prev</span>`}
  <span class="center">${parseInt(id, 10)} of ${total} · <a href="index.html">index</a></span>
  ${nextId ? `<a href="cycle-${nextId}.html">Cycle ${nextId} →</a>` : `<span class="disabled">next →</span>`}
</nav>

<section>
  <h2>SPEC.md</h2>
  ${specMd ? `<div class="md">${mdToHtml(specMd)}</div>` : `<div class="empty">SPEC.md not found for cycle ${id}.</div>`}
</section>

<section>
  <h2>Files changed (code only)</h2>
  <div class="scope-note">excluded: <code>*.md</code>, <code>docs/</code>, <code>.claude/</code>, <code>*.lock</code>, <code>package-lock.json</code></div>
  ${stat.trim() ? `<pre class="stat">${escapeHtml(stat)}</pre>` : `<div class="empty">No code changes (docs/markdown-only cycle).</div>`}
</section>

<section>
  <h2>Diff</h2>
  ${diff.trim() ? `<pre class="diff">${diffToHtml(diff)}</pre>` : `<div class="empty">No code diff.</div>`}
</section>

${reviewMd ? `<section><h2>REVIEW.md</h2><div class="md">${mdToHtml(reviewMd)}</div></section>` : ""}

<nav class="pager">
  ${prevId ? `<a href="cycle-${prevId}.html">← Cycle ${prevId}</a>` : `<span class="disabled">← prev</span>`}
  <span class="center"><a href="index.html">Index</a></span>
  ${nextId ? `<a href="cycle-${nextId}.html">Cycle ${nextId} →</a>` : `<span class="disabled">next →</span>`}
</nav>

<footer>Generated from <code>${sha}</code></footer>
</body>
</html>
`;

for (let i = 0; i < slice.length; i++) {
  const { sha, id, title } = slice[i];
  const prevId = i > 0 ? slice[i - 1].id : null;
  const nextId = i < slice.length - 1 ? slice[i + 1].id : null;

  const author = execSync(`git show -s --format='%an' ${sha}`, { encoding: "utf8", cwd: REPO_ROOT }).trim();
  const date = execSync(`git show -s --format='%ad' --date=iso ${sha}`, { encoding: "utf8", cwd: REPO_ROOT }).trim();

  const stat = execSync(`git show --stat --format='' ${sha} -- ${exArgs}`, {
    encoding: "utf8",
    cwd: REPO_ROOT,
    maxBuffer: 50 * 1024 * 1024,
  }).trim();
  const diff = execSync(`git show --format='' ${sha} -- ${exArgs}`, {
    encoding: "utf8",
    cwd: REPO_ROOT,
    maxBuffer: 50 * 1024 * 1024,
  });
  const cappedDiff = diff.length > 500_000 ? diff.slice(0, 500_000) + "\n\n[diff truncated at 500KB]" : diff;

  const specMd = readArtifact(id, "SPEC.md");
  const reviewMd = readArtifact(id, "REVIEW.md");

  const html = renderPage({
    sha, id, title, prevId, nextId, specMd, reviewMd, stat, diff: cappedDiff, author, date, total: slice.length,
  });
  writeFileSync(join(OUT_DIR, `cycle-${id}.html`), html);
  console.log(`  cycle-${id}.html (${(html.length / 1024).toFixed(1)}KB)`);
}

const INDEX_CSS = `
  :root { --bg: #0d1117; --bg-elev: #161b22; --fg: #e6edf3; --fg-muted: #8b949e; --border: #30363d; --link: #58a6ff; }
  body { font: 14px/1.55 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif; max-width: 1100px; margin: 0 auto; padding: 1.5rem; color: var(--fg); background: var(--bg); }
  a { color: var(--link); text-decoration: none; }
  h1 { border-bottom: 1px solid var(--border); padding-bottom: .5rem; }
  ul { list-style: none; padding: 0; }
  li { padding: .5rem .7rem; border-bottom: 1px solid var(--bg-elev); }
  li:hover { background: var(--bg-elev); }
  .id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--fg-muted); margin-right: .6rem; }
`;
const indexHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Cycle reports</title>
<style>${INDEX_CSS}</style>
</head>
<body>
<h1>Cycle reports (${slice.length})</h1>
<ul>
${slice.map((c) => `<li><a href="cycle-${c.id}.html"><span class="id">${c.id}</span>${escapeHtml(c.title)}</a></li>`).join("\n")}
</ul>
</body>
</html>
`;
writeFileSync(join(OUT_DIR, "index.html"), indexHtml);
console.log(`  index.html`);
