import { test } from "node:test";
import { strict as assert } from "node:assert";
import { validateOutput } from "../../src/engine/triage.ts";
import type { CycleConfig } from "../../src/engine/workflow.ts";
import type { QueueRow } from "../../src/engine/queue.ts";

const cfg: CycleConfig = {
  engine: { max_consecutive_failures: 2, base_branch: "main" },
  triage: { agent: "claudecode", prompt: "prompts/triage.md", max_turns: 10 },
  workflows: [
    {
      name: "feature",
      max_cycle_attempts: 3,
      steps: [{ name: "noop", agent: "bash", command: "scripts/noop.sh" }],
    },
  ],
};

const fakeRaws = [
  { id: "R1", body: "", fm: {}, srcPath: "/tmp/R1.md", attempts: 0 },
];

function validChildR1Json(): Record<string, unknown> {
  return {
    ordering: ["R1-x"],
    children: [
      {
        raw_id: "R1",
        slug: "x",
        id: "R1-x",
        title: "T",
        workflow: "feature",
        depends_on: [],
        body: "body",
      },
    ],
    decomposed_parents: ["R1"],
  };
}

function checkReject(stdout: string, queue: QueueRow[], expectInReason: string): void {
  const r = validateOutput(stdout, fakeRaws as never, queue, cfg);
  assert.equal(r.ok, false, "validator should reject");
  if (!r.ok) {
    assert.match(r.reason, new RegExp(expectInReason), `reason: ${r.reason}`);
  }
}

test("rejects malformed JSON", () => {
  checkReject("not json", [], "not valid JSON");
});

test("rejects when stdout is array, not object", () => {
  checkReject("[]", [], "not a JSON object");
});

test("rejects when ordering missing/not array", () => {
  const j = validChildR1Json();
  delete j.ordering;
  checkReject(JSON.stringify(j), [], "ordering");
});

test("rejects when ordering element is not string", () => {
  const j = validChildR1Json();
  j.ordering = [1];
  checkReject(JSON.stringify(j), [], "ordering\\[0\\]");
});

test("rejects when children missing", () => {
  const j = validChildR1Json();
  delete j.children;
  checkReject(JSON.stringify(j), [], "children");
});

test("rejects when decomposed_parents missing", () => {
  const j = validChildR1Json();
  delete j.decomposed_parents;
  checkReject(JSON.stringify(j), [], "decomposed_parents");
});

test("rejects when decomposed_parents element is not string", () => {
  const j = validChildR1Json();
  j.decomposed_parents = [42];
  checkReject(JSON.stringify(j), [], "decomposed_parents\\[0\\]");
});

test("rejects when a child is not an object", () => {
  const j = validChildR1Json();
  j.children = ["notobj"];
  checkReject(JSON.stringify(j), [], "children\\[0\\]");
});

test("rejects when child.raw_id missing", () => {
  const j = validChildR1Json();
  (j.children as Array<Record<string, unknown>>)[0].raw_id = 1;
  checkReject(JSON.stringify(j), [], "raw_id");
});

test("rejects when child.title is wrong type", () => {
  const j = validChildR1Json();
  (j.children as Array<Record<string, unknown>>)[0].title = null;
  checkReject(JSON.stringify(j), [], "title");
});

test("rejects when child.depends_on missing/non-array", () => {
  const j = validChildR1Json();
  (j.children as Array<Record<string, unknown>>)[0].depends_on = "x";
  checkReject(JSON.stringify(j), [], "depends_on");
});

test("rejects when child.depends_on element non-string", () => {
  const j = validChildR1Json();
  (j.children as Array<Record<string, unknown>>)[0].depends_on = [42];
  checkReject(JSON.stringify(j), [], "depends_on\\[0\\]");
});

test("rejects when child.id != raw_id and != raw_id-slug", () => {
  const j = validChildR1Json();
  (j.children as Array<Record<string, unknown>>)[0].id = "wrong";
  checkReject(JSON.stringify(j), [], "children\\[0\\].id");
});

test("rejects when child.workflow not in configured workflows", () => {
  const j = validChildR1Json();
  (j.children as Array<Record<string, unknown>>)[0].workflow = "ghost";
  checkReject(JSON.stringify(j), [], "workflow");
});

test("rejects when child.raw_id not in current batch", () => {
  const j = validChildR1Json();
  (j.children as Array<Record<string, unknown>>)[0].raw_id = "Z";
  (j.children as Array<Record<string, unknown>>)[0].id = "Z-x";
  checkReject(JSON.stringify(j), [], "raw_id");
});

test("rejects when decomposed_parents entry not in batch", () => {
  const j = validChildR1Json();
  j.decomposed_parents = ["GHOST"];
  checkReject(JSON.stringify(j), [], "decomposed_parents");
});

test("rejects duplicate child ids", () => {
  const j = validChildR1Json();
  const arr = j.children as Array<Record<string, unknown>>;
  arr.push({ ...arr[0] });
  j.ordering = ["R1-x", "R1-x"];
  checkReject(JSON.stringify(j), [], "duplicate");
});

test("rejects child id colliding with existing queue row", () => {
  const j = validChildR1Json();
  const queue: QueueRow[] = [
    {
      id: "R1-x",
      title: "x",
      status: "pending",
      attempt: 0,
      depends_on: [],
      triaged_at: "now",
    },
  ];
  checkReject(JSON.stringify(j), queue, "collides");
});

test("rejects duplicate ordering id", () => {
  const j = validChildR1Json();
  j.ordering = ["R1-x", "R1-x"];
  checkReject(JSON.stringify(j), [], "duplicate");
});

test("rejects ordering id not in pending or children", () => {
  const j = validChildR1Json();
  j.ordering = ["ghost"];
  checkReject(JSON.stringify(j), [], "ordering\\[0\\]");
});

test("rejects when children is not array", () => {
  const j = validChildR1Json();
  j.children = "x";
  checkReject(JSON.stringify(j), [], "children:");
});

test("rejects when decomposed_parents is not array", () => {
  const j = validChildR1Json();
  j.decomposed_parents = "x";
  checkReject(JSON.stringify(j), [], "decomposed_parents:");
});

test("accepts well-formed payload with pending queue context", () => {
  const j = validChildR1Json();
  j.ordering = ["R1-x", "OTHER"];
  const queue: QueueRow[] = [
    {
      id: "OTHER",
      title: "other",
      status: "pending",
      attempt: 0,
      depends_on: [],
      triaged_at: "now",
    },
  ];
  const r = validateOutput(JSON.stringify(j), fakeRaws as never, queue, cfg);
  assert.equal(r.ok, true);
});
