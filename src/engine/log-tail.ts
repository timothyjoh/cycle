import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type InFlightCycle = {
  cycleId: string;
  issueId: string;
  workflow: string;
  title: string;
  startTs: string;
  completedSteps: string[];
  lastStepStarted?: string;
};

type LogEvent = {
  ts: string;
  event: string;
  cycle_id?: string;
  [k: string]: unknown;
};

export function parseLogTail(text: string): InFlightCycle | null {
  const events: LogEvent[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as LogEvent);
    } catch {
      // skip malformed lines
    }
  }
  let lastStartIdx = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].event === "cycle.start") {
      lastStartIdx = i;
      break;
    }
  }
  if (lastStartIdx < 0) return null;
  const start = events[lastStartIdx];
  const cycleId = typeof start.cycle_id === "string" ? start.cycle_id : "";
  if (!cycleId) return null;
  for (let i = lastStartIdx + 1; i < events.length; i++) {
    if (events[i].event === "cycle.end" && events[i].cycle_id === cycleId) {
      return null;
    }
  }
  const completedSteps: string[] = [];
  for (let i = lastStartIdx + 1; i < events.length; i++) {
    const e = events[i];
    if (e.cycle_id !== cycleId) continue;
    let name: string | undefined;
    if (e.event === "step.end" && (e as { status?: string }).status === "ok") {
      name = (e as { step?: string }).step;
    } else if (e.event === "step.skipped") {
      name = (e as { step?: string }).step;
    } else {
      continue;
    }
    if (typeof name === "string" && !completedSteps.includes(name)) {
      completedSteps.push(name);
    }
  }
  let lastStepStarted: string | undefined;
  for (let i = events.length - 1; i > lastStartIdx; i--) {
    const e = events[i];
    if (e.event !== "step.start") continue;
    if (e.cycle_id !== cycleId) continue;
    const name = (e as { step?: string }).step;
    if (typeof name !== "string") continue;
    let ended = false;
    for (let j = i + 1; j < events.length; j++) {
      const f = events[j];
      if (
        f.event === "step.end" &&
        f.cycle_id === cycleId &&
        (f as { step?: string }).step === name
      ) {
        ended = true;
        break;
      }
    }
    if (!ended) {
      lastStepStarted = name;
      break;
    }
  }
  const rawIssue = (start as Record<string, unknown>).issue_id;
  const rawWf = (start as Record<string, unknown>).workflow;
  const rawTitle = (start as Record<string, unknown>).title;
  const issueId = typeof rawIssue === "string" ? rawIssue : "";
  const workflow = typeof rawWf === "string" ? rawWf : "";
  const title = typeof rawTitle === "string" ? rawTitle : "";
  return {
    cycleId,
    issueId,
    workflow,
    title,
    startTs: start.ts,
    completedSteps,
    lastStepStarted,
  };
}

export async function readLogTail(repoRoot: string): Promise<InFlightCycle | null> {
  try {
    const text = await readFile(join(repoRoot, ".cycle", "log.jsonl"), "utf8");
    return parseLogTail(text);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
