# Publishing klip-stitcher

This project publishes desktop release artifacts to GitHub Releases through Electron Forge.

## Token choice

Use different tokens depending on where the publish happens:

- GitHub Actions: use the built-in `GITHUB_TOKEN`
- Local `npm run publish`: use a user-owned fine-grained personal access token

For local publishing, the recommended token is:

- Token type: fine-grained personal access token
- Repository access: `Only select repositories`
- Selected repository: `crimsonstrife/klip-stitcher`
- Repository permissions:
  - `Contents: Read and write`

That permission level is what GitHub requires for creating releases and uploading release assets.

## Local publish

1. Create or update your fine-grained personal access token.
2. Set it in your shell as `GITHUB_TOKEN`.
3. Run the publish command.

PowerShell example:

```powershell
$env:GITHUB_TOKEN = 'github_pat_...'
npm run publish
```

Electron Forge will build the release artifacts and upload them to the GitHub Releases page for `crimsonstrife/klip-stitcher`.

## GitHub Actions publish

The repository already includes a release workflow at `.github/workflows/release.yml`.

It:

1. Runs on pushes to tags matching `v*`
2. Installs dependencies
3. Runs lint and TypeScript checks
4. Runs `npm run make`
5. Creates the GitHub Release if it does not already exist
6. Uploads the built artifacts with `gh release upload --clobber`

The workflow uses the repo-scoped `GITHUB_TOKEN` automatically, with `contents: write` permission.

This makes reruns safer than Forge's publisher alone, because an existing release tag can be reused instead of failing with `already_exists`.

## Recommended release flow

For a normal release:

1. Update `package.json` version if needed.
2. Commit the release changes.
3. Create a semver tag like `v0.1.0`.
4. Push the branch and tag.

Example:

```powershell
git tag v0.1.0
git push origin main
git push origin v0.1.0
```

Once the tag reaches GitHub, the workflow will publish the Windows release artifacts automatically.

## Manual release flow

If you want to publish from your own machine instead of waiting for Actions:

```powershell
$env:GITHUB_TOKEN = 'github_pat_...'
npm run publish
```

Use this when:

- You want to test the release path before relying on CI
- You need to republish from a trusted development machine

## Notes about auto-update

`update-electron-app` only sees stable public GitHub releases. Draft releases and prereleases are ignored by the public update service, so stable in-app updates require:

- A public release
- A valid semver tag such as `v0.1.0`
- The required Windows release assets uploaded successfully

## Unsigned Windows builds

Current Windows builds are unsigned. Users may see a SmartScreen warning on first launch.

The expected install path is:

1. Click `More info`
2. Click `Run anyway`

## Troubleshooting

If local `npm run publish` fails with authentication errors:

- Confirm you used a user token, not the GitHub Actions token
- Confirm the token has `Contents: Read and write`
- Confirm the token is scoped to `crimsonstrife/klip-stitcher`

If auto-update does not see a release:

- Make sure the GitHub Release is not a draft
- Make sure it is not marked as a prerelease
- Make sure the tag is valid semver with the default `v` prefix

If the GitHub Actions workflow is rerun for the same tag:

- The workflow will reuse the existing release
- Existing assets with the same names are overwritten with `--clobber`
