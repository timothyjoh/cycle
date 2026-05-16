Blocked at every write. Chicken-and-egg: can't add Edit permission without Edit permission. 

**Root cause:** `settings.local.json` has no `Edit(*)` or `Write(*)` allow rules. Every agent write attempt generates a permission prompt — automated cycle engine gets blocked because no user is present to approve.

**Options:**

1. **Quick fix for this session:** Run `/config` and switch to `acceptEdits` permission mode, then I can apply all 4 edits.

2. **Permanent fix:** Manually add two lines to `.claude/settings.local.json`:
   ```json
   "Edit(*)",
   "Write(*)",
   ```
   Insert them at the top of the `"allow"` array.

3. **Apply the 4 edits manually** — all trivial:

   **`src/defaults/workflows.yml` line 21** — change `verify` line and insert after it:
   ```yaml
         - { name: verify,     agent: bash,       command: scripts/verify.sh }
         - { name: reflection, agent: claudecode, prompt: prompts/reflection.md }
   ```

   **`.cycle/workflows.yml` line 28** — same insert after verify:
   ```yaml
         - { name: verify,     agent: bash,       command: scripts/verify.sh }
         - { name: reflection, agent: claudecode, prompt: prompts/reflection.md }
   ```

   **`tests/defaults/feature-yaml.test.ts` lines 11–12:**
   ```ts
   assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "reflection", "commit", "pr", "documentation"]);
   assert.equal(feature.steps.length, 11, "regression guard: step count should be 11");
   ```

   **`CLAUDE.md` after line 44** — add:
   ```markdown
   - **Workflow step ordering:** `reflection` must precede `commit` and `pr` in any workflow that uses it — reflection artifacts must ride the same commit as the feature change that produced them.
   ```

Option 2 is the permanent fix that unblocks all future cycle engine runs. Recommend doing that first, then I can apply the 4 edits automatically.
