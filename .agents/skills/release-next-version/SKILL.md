---
name: release-next-version
description: Use when releasing this cycle project to npm/GitHub by bumping package metadata, committing the version change, creating a vX.Y.Z git tag, and pushing master plus the tag. If the user does not give an exact version, ask whether this is a patch, minor, or major release and derive the next semver version.
---

# Release Next Version

Release `@cycleai/cli` by making the package version and git tag agree. The GitHub release/npm publish workflow is tag-driven, so the tag must point at a commit whose `package.json` and `package-lock.json` already contain the target version.

## Inputs

- If the user gives an exact version such as `0.3.1` or `v0.3.1`, use it after normalizing to:
  - package version: `0.3.1`
  - tag: `v0.3.1`
- If the user does not give an exact version, inspect `package.json` and ask one concise question: patch, minor, or major?
- Do not guess a release type when publishing would be triggered.

## Workflow

1. Inspect state:
   - `git status --short --branch`
   - `node -p "require('./package.json').version"`
   - `git tag --list vX.Y.Z`
2. Keep unrelated local changes out of the release commit. If unrelated dirty files exist, leave them unstaged and mention them.
3. Update metadata:
   - `npm version X.Y.Z --no-git-tag-version`
   - This updates both `package.json` and `package-lock.json`.
4. Build and smoke test:
   - `npm run build`
   - `node dist/cycle.js --version`
   - The smoke output must equal `X.Y.Z`.
5. Stage and review only release metadata:
   - `git add package.json package-lock.json`
   - `git diff --cached`
6. Commit:
   - `git commit -m "chore(release): bump package version to X.Y.Z" -m "Update package metadata so the bundled CLI and npm package report X.Y.Z."`
7. Tag the release commit:
   - `git tag vX.Y.Z`
   - If sandboxing blocks tag creation under `.git`, rerun the same command with approved escalation.
8. Push in order:
   - `git push origin master`
   - `git push origin vX.Y.Z`
9. Verify:
   - `git ls-remote --tags origin vX.Y.Z`
   - `git status --short --branch`

## Guardrails

- Never create or push the tag before committing the package metadata bump.
- Never move an existing release tag without explicit user approval.
- Do not include generated `dist/` changes in the release commit unless the repo policy changes; the publish script builds `dist/`.
- If `npm run build` or the version smoke test fails, stop before committing or tagging.
- If the user asks to copy the freshly built engine into local projects after release, rebuild from the committed metadata and verify the copied `.cycle/bin/cycle.js --version`.
