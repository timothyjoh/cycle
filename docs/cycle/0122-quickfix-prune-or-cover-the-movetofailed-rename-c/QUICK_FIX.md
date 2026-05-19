Need permission to edit `src/engine/triage.ts`. Once granted, I'll remove the 3-line try/catch around `rename` in `moveToFailed` and add a pinning test. The change is:

**`src/engine/triage.ts` lines 683-687** — replace:
```typescript
  try {
    await rename(raw.srcPath, join(failedDir, `${raw.id}.md`));
  } catch {
    // raw file may have been removed mid-flight; nothing else to do
  }
}
```
with:
```typescript
  await rename(raw.srcPath, join(failedDir, `${raw.id}.md`));
}
```

Then add this test to `tests/engine/triage.test.ts`:
```typescript
test("moveToFailed rename failure propagates after catch-swallow removed", async () => {
  const root = await setupRepo();
  try {
    await writeFile(join(root, "docs/cycle/issues/raw/A.md"), rawBody("A", "raw A"), "utf8");
    await writeFile(join(root, "docs/cycle/issues/raw/B.md"), rawBody("B", "raw B"), "utf8");
    // Block the rename by pre-creating a directory at the target path
    await mkdir(join(root, "docs/cycle/issues/failed/A.md"), { recursive: true });
    const deps: TriageDeps = {
      runAgent: async (prompt) => {
        if (prompt.includes("=== raw: A ==="))
          return { exitCode: 0, stdout: "not json", stderr: "" };
        return { exitCode: 0, stdout: enrichJson("B"), stderr: "" };
      },
    };
    const { log } = makeLog();
    await assert.rejects(() => runTriage(root, makeConfig(), log, deps));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

Please grant write permission and I'll apply both edits.
