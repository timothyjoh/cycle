# Publishing to npm

Published as `@cycleai/cli` via GitHub Actions trusted publishing (OIDC). No npm token, no OTP.

## Trusted publisher config (set up on npmjs.com)

| Field | Value |
|---|---|
| Provider | GitHub Actions |
| Organization or user | `timothyjoh` |
| Repository | `cycle` |
| Workflow filename | `publish.yml` |
| Environment name | *(blank)* |

All fields are case-sensitive. Whitespace breaks the match silently — symptom is `npm error 404 PUT /@cycleai%2Fcli`.

## Release a new version

```sh
# 1. Bump version and commit
vim package.json              # bump "version": "0.0.X"
git add package.json package-lock.json
git commit -m "Bump to 0.0.X"
git push origin master

# 2. Tag — triggers the publish workflow
git tag v0.0.X
git push origin v0.0.X

# 3. Watch
gh run watch --exit-status $(gh run list --workflow=publish.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```

If a workflow fails after the publish step has already pushed the version, **do not retry by re-tagging** — npm rejects re-publish of the same version. Bump the patch number instead.

## Manual publish (fallback only)

```sh
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
npm publish --access public --otp=<6-digit code>
```

`prepublishOnly` in package.json runs `node scripts/build.mjs` before any publish — `dist/` is always packaged. Without this, `npm publish` silently ships without `dist/` (this broke 0.0.1 and 0.0.2).
