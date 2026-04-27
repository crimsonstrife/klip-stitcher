import type { IpcMain } from 'electron';
import { CH } from '../../shared/ipc-channels';
import type { FfmpegPaths } from '../../shared/ipc-contract';
import { resolveFfmpegPath, resolveFfprobePath } from '../ffmpeg/binaries';

export function registerIpcHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(CH.FFMPEG_PATHS, async (): Promise<FfmpegPaths> => ({
    ffmpeg: resolveFfmpegPath(),
    ffprobe: resolveFfprobePath(),
  }));
}
