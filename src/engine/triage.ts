import { randomBytes } from "node:crypto";
import { readFile, writeFile, readdir, mkdir, rename, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import {
  parseFrontmatter,
  serializeFrontmatter,
  mutateFrontmatter,
  type Frontmatter,
} from "./frontmatter.ts";
import {
  readQueue,
  writeQueue,
  appendRow,
  bootstrapArchiveIfLegacy,
  type QueueRow,
} from "./queue.ts";
import { resolveAgent } from "./exec.ts";
import type { CycleConfig, TriageConfig } from "./workflow.ts";
import type { Logger } from "./log.ts";

export type TriageAgentResult = { exitCode: number; stdout: string; stderr: string };

export type TriageAgentRunner = (
  prompt: string,
  cfg: TriageConfig,
  repoRoot: string,
) => Promise<TriageAgentResult>;

export type TriageDeps = {
  runAgent?: TriageAgentRunner;
};

export type TriageStatus = "ok" | "paused" | "empty";

export type TriageResult = {
  status: TriageStatus;
  processed: string[];
  failed: string[];
};

type TriageChild = {
  raw_id: string;
  slug: string;
  id: string;
  title: string;
  workflow: string;
  depends_on: string[];
  body: string;
};

type TriageOutput = {
  ordering: string[];
  children: TriageChild[];
  decomposed_parents: string[];
};

type RawIssue = {
  id: string;
  body: string;
  fm: Frontmatter;
  srcPath: string;
  attempts: number;
};

type ParsedTriageOutput = TriageOutput;

type RawAttemptOutcome =
  | { status: "ok"; parsed: ParsedTriageOutput; attempts: number }
  | { status: "failed"; lastError: string; attempts: number };

interface ProcessCtx {
  repoRoot: string;
  cfg: CycleConfig;
  promptTemplate: string;
  runAgent: TriageAgentRunner;
  apply?: (raw: RawIssue, parsed: ParsedTriageOutput) => Promise<void>;
  onAttemptFailed?: (attemptNumber: number, reason: string) => Promise<void>;
}

export interface DryRunReport {
  raw_id: string;
  status: "ok" | "failed";
  attempts: number;
  last_error?: string;
  children?: string[];
}

const MAX_ATTEMPTS = 3;

async function processRawWithRetry(
  raw: RawIssue,
  ctx: ProcessCtx,
): Promise<RawAttemptOutcome> {
  let lastError = "";
  let attemptsRun = 0;

  for (let attempt = raw.attempts; attempt < MAX_ATTEMPTS; attempt++) {
    attemptsRun++;
    const queueRows = await readQueue(ctx.repoRoot);
    const todoListing = await listTodos(ctx.repoRoot);
    const feedback = lastError
      ? `PREVIOUS ATTEMPT FAILED VALIDATION:\n${lastError}`
      : "";
    const renderedPrompt = renderPrompt(
      ctx.promptTemplate,
      [raw],
      queueRows,
      todoListing,
      feedback,
    );

    let agentResult: TriageAgentResult;
    try {
      agentResult = await ctx.runAgent(renderedPrompt, ctx.cfg.triage, ctx.repoRoot);
    } catch (e) {
      lastError = `agent failed: ${(e as Error).message}`;
      if (ctx.onAttemptFailed) await ctx.onAttemptFailed(attempt + 1, lastError);
      continue;
    }

    if (agentResult.exitCode !== 0) {
      lastError = `agent exited ${agentResult.exitCode}: ${agentResult.stderr.trim()}`;
      if (ctx.onAttemptFailed) await ctx.onAttemptFailed(attempt + 1, lastError);
      continue;
    }

    const todoIds = new Set(todoListing.map((f) => f.replace(/\.md$/, "")));
    const validation = validateOutput(
      agentResult.stdout,
      [raw],
      queueRows,
      ctx.cfg,
      todoIds,
    );
    if (!validation.ok) {
      lastError = validation.reason;
      if (ctx.onAttemptFailed) await ctx.onAttemptFailed(attempt + 1, lastError);
      continue;
    }

    if (ctx.apply) {
      try {
        await ctx.apply(raw, validation.parsed);
      } catch (e) {
        lastError = `apply failed: ${(e as Error).message}`;
        if (ctx.onAttemptFailed) await ctx.onAttemptFailed(attempt + 1, lastError);
        continue;
      }
    }

    return { status: "ok", parsed: validation.parsed, attempts: attemptsRun };
  }

  return { status: "failed", lastError, attempts: attemptsRun };
}

export async function runTriage(
  repoRoot: string,
  cfg: CycleConfig,
  log: Logger,
  deps: TriageDeps = {},
): Promise<TriageResult> {
  const runAgent = deps.runAgent ?? runAgentViaDispatch;

  await bootstrapArchiveIfLegacy(repoRoot);

  const rawDir = join(repoRoot, "docs/cycle/issues/raw");
  await mkdir(rawDir, { recursive: true });

  const raws = await loadRaws(rawDir);

  await log.emit("triage.start", { count: raws.length });

  if (raws.length === 0) {
    await log.emit("triage.end", { processed: 0, failed: 0 });
    return { status: "ok", processed: [], failed: [] };
  }

  const promptTemplate = await readFile(
    join(repoRoot, ".cycle", cfg.triage.prompt),
    "utf8",
  );

  const processed: string[] = [];
  const failed: string[] = [];
  const lastErrors: string[] = []; // index-aligned with `failed`
  let lastOrdering: string[] | null = null;

  // Per-raw invocation: each raw gets its own agent call and its own 3-attempt
  // retry budget. SPEC §Requirements suggests a single batched prompt; we
  // deviate so a poison raw can't block its siblings. See BUILD.md §Deviations.
  for (const raw of raws) {
    const outcome = await processRawWithRetry(raw, {
      repoRoot,
      cfg,
      promptTemplate,
      runAgent,
      apply: (r, parsed) => applyRaw(repoRoot, r, parsed),
      onAttemptFailed: async (attemptNumber, reason) => {
        await bumpAttempts(raw.srcPath, attemptNumber);
        await log.emit("triage.raw.failed", {
          raw_id: raw.id,
          attempt: attemptNumber,
          reason,
        });
      },
    });

    if (outcome.status === "ok") {
      lastOrdering = outcome.parsed.ordering;
      await log.emit("triage.raw.ok", {
        raw_id: raw.id,
        children: outcome.parsed.children
          .filter((c) => c.raw_id === raw.id)
          .map((c) => c.id),
      });
      processed.push(raw.id);
    } else {
      failed.push(raw.id);
      lastErrors.push(outcome.lastError);
      await moveToFailed(repoRoot, raw);
    }
  }

  if (lastOrdering) {
    await rewriteOrdering(repoRoot, lastOrdering, log);
  }

  if (failed.length === raws.length) {
    const MAX_ERR_LEN = 2000;
    const truncate = (s: string) =>
      s.length > MAX_ERR_LEN ? s.slice(0, MAX_ERR_LEN - 1) + "…" : s;
    const raw_ids = failed;
    const last_errors = failed.map((raw_id, i) => ({
      raw_id,
      error: truncate(lastErrors[i] ?? ""),
    }));
    await log.emit("engine.paused", {
      reason: "all_triage_failed",
      raw_ids,
      last_errors,
    });
    return { status: "paused", processed, failed };
  }

  await log.emit("triage.end", {
    processed: processed.length,
    failed: failed.length,
  });
  return { status: "ok", processed, failed };
}

export async function dryRunTriage(
  repoRoot: string,
  cfg: CycleConfig,
  deps: TriageDeps = {},
): Promise<DryRunReport[]> {
  const runAgent = deps.runAgent ?? runAgentViaDispatch;
  const rawDir = join(repoRoot, "docs/cycle/issues/raw");
  const raws = await loadRaws(rawDir);
  if (raws.length === 0) return [];

  const promptTemplate = await readFile(
    join(repoRoot, ".cycle", cfg.triage.prompt),
    "utf8",
  );

  const reports: DryRunReport[] = [];
  for (const raw of raws) {
    // Dry-run reports the agent invocation count for THIS pass; on-disk
    // triage_attempts (from prior real runs) must not shrink the retry
    // budget. Clone with attempts: 0 to count from scratch.
    const outcome = await processRawWithRetry(
      { ...raw, attempts: 0 },
      {
        repoRoot,
        cfg,
        promptTemplate,
        runAgent,
      },
    );
    if (outcome.status === "ok") {
      reports.push({
        raw_id: raw.id,
        status: "ok",
        attempts: outcome.attempts,
        children: outcome.parsed.children
          .filter((c) => c.raw_id === raw.id)
          .map((c) => c.id),
      });
    } else {
      reports.push({
        raw_id: raw.id,
        status: "failed",
        attempts: outcome.attempts,
        last_error: outcome.lastError,
      });
    }
  }
  return reports;
}

async function loadRaws(rawDir: string): Promise<RawIssue[]> {
  let files: string[] = [];
  try {
    files = (await readdir(rawDir)).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return [];
  }
  const raws: RawIssue[] = [];
  for (const f of files) {
    const srcPath = join(rawDir, f);
    const body = await readFile(srcPath, "utf8");
    const { fm, bodyAfter } = parseFrontmatter(body);
    const id = String(fm.id);
    const attempts =
      typeof fm.triage_attempts === "number" ? fm.triage_attempts : 0;
    raws.push({ id, body: bodyAfter, fm, srcPath, attempts });
  }
  return raws;
}

async function listTodos(repoRoot: string): Promise<string[]> {
  const todoDir = join(repoRoot, "docs/cycle/issues/todo");
  try {
    return (await readdir(todoDir)).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return [];
  }
}

function renderPrompt(
  template: string,
  raws: RawIssue[],
  queueRows: QueueRow[],
  todoListing: string[],
  retryFeedback: string,
): string {
  const rawsBlock = raws
    .map((r) => {
      const fmSerialized = serializeFrontmatter(r.fm, r.body);
      return `=== raw: ${r.id} ===\n${fmSerialized}`;
    })
    .join("\n");
  const tbd = queueRows.map((r) => JSON.stringify(r)).join("\n");
  const todoText = todoListing.join("\n");
  return template
    .replace("{{RAWS_BLOCK}}", rawsBlock)
    .replace("{{TBD_JSONL}}", tbd)
    .replace("{{TODO_LISTING}}", todoText)
    .replace("{{RETRY_FEEDBACK}}", retryFeedback);
}

export function validateOutput(
  rawStdout: string,
  raws: RawIssue[],
  queueRows: QueueRow[],
  cfg: CycleConfig,
  todoIds: Set<string> = new Set(),
): { ok: true; parsed: TriageOutput } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawStdout);
  } catch (e) {
    return { ok: false, reason: `stdout is not valid JSON: ${(e as Error).message}` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "stdout is not a JSON object" };
  }
  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.ordering)) {
    return {
      ok: false,
      reason: `ordering: expected array, got ${typeof obj.ordering}`,
    };
  }
  for (let i = 0; i < obj.ordering.length; i++) {
    if (typeof obj.ordering[i] !== "string") {
      return { ok: false, reason: `ordering[${i}]: expected string` };
    }
  }

  if (!Array.isArray(obj.children)) {
    return {
      ok: false,
      reason: `children: expected array, got ${typeof obj.children}`,
    };
  }

  if (!Array.isArray(obj.decomposed_parents)) {
    return {
      ok: false,
      reason: `decomposed_parents: expected array, got ${typeof obj.decomposed_parents}`,
    };
  }
  for (let i = 0; i < obj.decomposed_parents.length; i++) {
    if (typeof obj.decomposed_parents[i] !== "string") {
      return {
        ok: false,
        reason: `decomposed_parents[${i}]: expected string`,
      };
    }
  }

  const children: TriageChild[] = [];
  const stringFields: (keyof TriageChild)[] = [
    "raw_id",
    "slug",
    "id",
    "title",
    "workflow",
    "body",
  ];
  for (let i = 0; i < obj.children.length; i++) {
    const c = obj.children[i];
    if (!c || typeof c !== "object" || Array.isArray(c)) {
      return { ok: false, reason: `children[${i}]: expected object` };
    }
    const co = c as Record<string, unknown>;
    for (const field of stringFields) {
      if (typeof co[field] !== "string") {
        return {
          ok: false,
          reason: `children[${i}].${field}: expected string, got ${typeof co[field]}`,
        };
      }
    }
    if (!Array.isArray(co.depends_on)) {
      return {
        ok: false,
        reason: `children[${i}].depends_on: expected array, got ${typeof co.depends_on}`,
      };
    }
    for (let j = 0; j < co.depends_on.length; j++) {
      if (typeof co.depends_on[j] !== "string") {
        return {
          ok: false,
          reason: `children[${i}].depends_on[${j}]: expected string`,
        };
      }
    }
    const child = co as unknown as TriageChild;

    if (
      child.id !== child.raw_id &&
      child.id !== `${child.raw_id}-${child.slug}`
    ) {
      return {
        ok: false,
        reason: `children[${i}].id: expected ${child.raw_id} or ${child.raw_id}-${child.slug}, got ${child.id}`,
      };
    }

    if (!cfg.workflows.some((w) => w.name === child.workflow)) {
      return {
        ok: false,
        reason: `children[${i}].workflow: ${child.workflow} not in configured workflows`,
      };
    }

    if (!raws.some((r) => r.id === child.raw_id)) {
      return {
        ok: false,
        reason: `children[${i}].raw_id: ${child.raw_id} not in current batch`,
      };
    }

    children.push(child);
  }

  for (const p of obj.decomposed_parents as string[]) {
    if (!raws.some((r) => r.id === p)) {
      return {
        ok: false,
        reason: `decomposed_parents: ${p} not in current batch`,
      };
    }
  }

  const seen = new Set<string>();
  for (let i = 0; i < children.length; i++) {
    if (seen.has(children[i].id)) {
      return {
        ok: false,
        reason: `children[${i}].id: duplicate ${children[i].id}`,
      };
    }
    seen.add(children[i].id);
  }

  const queueIds = new Set(queueRows.map((r) => r.id));
  for (let i = 0; i < children.length; i++) {
    if (queueIds.has(children[i].id)) {
      return {
        ok: false,
        reason: `children[${i}].id: ${children[i].id} collides with existing queue row`,
      };
    }
  }

  const pendingIds = new Set(
    queueRows.filter((r) => r.status === "pending").map((r) => r.id),
  );
  const childIds = new Set(children.map((c) => c.id));
  const orderingArr = obj.ordering as string[];
  const orderingSeen = new Set<string>();
  for (let i = 0; i < orderingArr.length; i++) {
    const id = orderingArr[i];
    if (orderingSeen.has(id)) {
      return { ok: false, reason: `ordering[${i}]: duplicate ${id}` };
    }
    orderingSeen.add(id);
    if (!pendingIds.has(id) && !childIds.has(id)) {
      return {
        ok: false,
        reason: `ordering[${i}]: ${id} not in current pending and not in new children`,
      };
    }
  }

  const knownIds = new Set<string>([...childIds, ...queueIds, ...todoIds]);
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    for (let j = 0; j < c.depends_on.length; j++) {
      const dep = c.depends_on[j];
      if (dep === c.id) {
        return {
          ok: false,
          reason: `children[${i}].depends_on[${j}]: ${c.id} depends on itself (self-loop)`,
        };
      }
      if (!knownIds.has(dep)) {
        return {
          ok: false,
          reason: `children[${i}].depends_on[${j}]: ${dep} is not a sibling child, tbd.jsonl row, or todo/<id>.md file (offending child: ${c.id})`,
        };
      }
    }
  }

  return {
    ok: true,
    parsed: {
      ordering: orderingArr,
      children,
      decomposed_parents: obj.decomposed_parents as string[],
    },
  };
}

async function applyRaw(
  repoRoot: string,
  raw: RawIssue,
  parsed: TriageOutput,
): Promise<void> {
  const children = parsed.children.filter((c) => c.raw_id === raw.id);
  const appliedTodos: string[] = [];
  const appliedIds: string[] = [];

  const todoDir = join(repoRoot, "docs/cycle/issues/todo");
  const doneDir = join(repoRoot, "docs/cycle/issues/done");
  await mkdir(todoDir, { recursive: true });

  try {
    const triagedAt = new Date().toISOString();
    for (const child of children) {
      const todoPath = join(todoDir, `${child.id}.md`);
      const fm: Frontmatter = {
        id: child.id,
        title: child.title,
        workflow: child.workflow,
        depends_on: child.depends_on,
        triaged_at: triagedAt,
        source: "triage",
      };
      if (child.id !== raw.id) fm.parent = raw.id;

      const bodyTail = child.body.endsWith("\n") ? child.body : child.body + "\n";
      const todoContent = serializeFrontmatter(fm, bodyTail);
      await atomicWrite(todoPath, todoContent);
      appliedTodos.push(todoPath);

      const row: QueueRow = {
        id: child.id,
        title: child.title,
        status: "pending",
        attempt: 0,
        depends_on: child.depends_on,
        triaged_at: triagedAt,
      };
      if (child.id !== raw.id) row.parent = raw.id;

      await appendRow(repoRoot, row);
      appliedIds.push(child.id);
    }

    await mkdir(doneDir, { recursive: true });
    await rename(raw.srcPath, join(doneDir, `${raw.id}_raw.md`));
  } catch (e) {
    for (const todo of appliedTodos) {
      try {
        await unlink(todo);
      } catch {
        // best-effort
      }
    }
    if (appliedIds.length > 0) {
      try {
        const rows = await readQueue(repoRoot);
        const idSet = new Set(appliedIds);
        const next = rows.filter((r) => !idSet.has(r.id));
        await writeQueue(repoRoot, next);
      } catch {
        // best-effort
      }
    }
    throw e;
  }
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = path + ".tmp";
  await writeFile(tmp, content, "utf8");
  try {
    await rename(tmp, path);
  } catch (e) {
    try {
      await unlink(tmp);
    } catch {
      // best-effort cleanup
    }
    throw e;
  }
}

async function bumpAttempts(srcPath: string, attempts: number): Promise<void> {
  try {
    await mutateFrontmatter(srcPath, (fm) => ({
      ...fm,
      triage_attempts: attempts,
    }));
  } catch {
    // raw file may already have been moved or is unwritable
  }
}

async function moveToFailed(repoRoot: string, raw: RawIssue): Promise<void> {
  const failedDir = join(repoRoot, "docs/cycle/issues/failed");
  await mkdir(failedDir, { recursive: true });
  try {
    await mutateFrontmatter(raw.srcPath, (fm) => ({
      ...fm,
      triage_attempts: MAX_ATTEMPTS,
      failed_at: new Date().toISOString(),
      failed_step: "triage",
    }));
  } catch {
    // proceed with rename anyway
  }
  try {
    await rename(raw.srcPath, join(failedDir, `${raw.id}.md`));
  } catch {
    // raw file may have been removed mid-flight; nothing else to do
  }
}

async function rewriteOrdering(
  repoRoot: string,
  ordering: string[],
  log: Logger,
): Promise<void> {
  const rows = await readQueue(repoRoot);
  const inProgress = rows.filter((r) => r.status === "in_progress");
  const pending = rows.filter((r) => r.status === "pending");
  const byId = new Map(pending.map((r) => [r.id, r]));

  const ordered: QueueRow[] = [];
  for (const id of ordering) {
    const row = byId.get(id);
    if (row) {
      ordered.push(row);
      byId.delete(id);
    }
  }

  for (const [id, row] of byId) {
    await log.emit("triage.warning", { reason: "ordering_omitted", id });
    ordered.push(row);
  }

  await writeQueue(repoRoot, [...inProgress, ...ordered]);
}

// Default TriageAgentRunner. Materializes the rendered prompt to a tmp file
// under .cycle/ (ExecModule.runStep takes a promptPath, not an inline string),
// then dispatches via resolveAgent. NOTE: process-spawn failures now surface as
// {exitCode: -1} (resolved) rather than a Promise rejection; the try/catch in
// processRawWithRetry still catches the synchronous UnknownAgentError from
// resolveAgent and any filesystem error from the tmp-file write.
async function runAgentViaDispatch(
  prompt: string,
  cfg: TriageConfig,
  repoRoot: string,
): Promise<TriageAgentResult> {
  const mod = resolveAgent(cfg.agent);
  const cycleDir = join(repoRoot, ".cycle");
  await mkdir(cycleDir, { recursive: true });
  const tmpName = `.triage-${randomBytes(8).toString("hex")}.prompt.md`;
  const tmpPath = join(cycleDir, tmpName);
  try {
    await writeFile(tmpPath, prompt, "utf8");
    const r = await mod.runStep({ repoRoot, promptPath: tmpName });
    return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr };
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}
