import { app } from 'electron';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStaticPkg from 'ffprobe-static';

const FFMPEG_BIN = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
const FFPROBE_BIN = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';

export function resolveFfmpegPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, FFMPEG_BIN);
  }
  if (!ffmpegStatic) {
    throw new Error('ffmpeg-static binary path not resolved (dev mode)');
  }
  return ffmpegStatic;
}

export function resolveFfprobePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, FFPROBE_BIN);
  }
  return (ffprobeStaticPkg as { path: string }).path;
}
