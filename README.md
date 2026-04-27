# klip-stitcher

`klip-stitcher` is a desktop app for stitching OBS auto-split recordings into one seamless export for editing. It is built with Electron, React, TypeScript, and bundled FFmpeg binaries, so end users do not need FFmpeg installed separately.

## Current scope

- Scan OBS clip folders and group sessions automatically
- Select, exclude, and reorder clips before stitching
- Stream-copy stitch to MKV or MP4 when the media is compatible
- Detect gaps and codec mismatches before export
- Create post-stitch split files or VOD-aligned chapter exports
- Cache thumbnails and remember recent folders/output paths

## Development

```bash
npm install
npm start
```

Useful checks:

```bash
npm run lint
npx tsc --noEmit
```

## Packaging

Create a local packaged build:

```bash
npm run package
```

Create local distributables:

```bash
npm run make
```

FFmpeg and ffprobe are bundled into the packaged app through Electron Forge `extraResource`, so packaged builds work on clean Windows machines without a system FFmpeg install.

## GitHub Releases

GitHub Releases are published through Electron Forge's GitHub publisher.

For the exact token setup and step-by-step release flow, see [PUBLISHING.md](C:/Users/thecr/Repositories/klip-stitcher/PUBLISHING.md).

Requirements:

- A public GitHub repository at `crimsonstrife/klip-stitcher`
- A `GITHUB_TOKEN` with repository `contents: write`
- A version tag like `v0.1.0`

Local publish:

```bash
npm run publish
```

Automated publish:

- Pushing a tag that matches `v*` triggers `.github/workflows/release.yml`.
- The workflow installs dependencies, runs lint and TypeScript checks, then uploads the Windows release artifacts to GitHub Releases.
- Release notes are generated automatically by the GitHub publisher configuration.

## Auto-update

Packaged Windows and macOS builds call `update-electron-app` from the main process and check GitHub Releases for updates every hour. Draft and pre-release GitHub releases are ignored by the public update service, so stable auto-updates require normal published releases with semver tags.

## Unsigned Windows builds

`klip-stitcher` v0.1 ships unsigned on Windows. SmartScreen may warn that the app is from an unknown publisher.

If that happens:

1. Click `More info`.
2. Click `Run anyway`.

This is expected until the project uses a Windows code-signing certificate.
