import { app } from 'electron';
import path from 'node:path';

// IMPORTANT: do not `import 'ffmpeg-static'` / `'ffprobe-static'` from main-
// process runtime code. Forge does not ship node_modules inside the packaged
// asar, so a runtime require() of those packages fails in production with
// "Cannot find module 'ffmpeg-static'". The packages still belong in
// `dependencies` so npm's postinstall downloads the binaries; forge.config.ts
// then reads their on-disk paths at build time and copies the binaries to
// resources/ via packagerConfig.extraResource.

const FFMPEG_BIN = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
const FFPROBE_BIN = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';

export function resolveFfmpegPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, FFMPEG_BIN);
  }
  return path.join(
    app.getAppPath(),
    'node_modules',
    'ffmpeg-static',
    FFMPEG_BIN,
  );
}

export function resolveFfprobePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, FFPROBE_BIN);
  }
  return path.join(
    app.getAppPath(),
    'node_modules',
    'ffprobe-static',
    'bin',
    process.platform,
    process.arch,
    FFPROBE_BIN,
  );
}
