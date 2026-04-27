import {
  type IpcMain,
  type BrowserWindow,
  dialog,
  shell,
} from 'electron';
import { randomUUID } from 'node:crypto';
import { CH } from '../../shared/ipc-channels';
import type {
  ClipProbeResult,
  ClipScanResult,
  ClipThumbnailRequest,
  ClipThumbnailResult,
  FfmpegPaths,
  JobDone,
  JobProgress,
  StitchOptions,
} from '../../shared/ipc-contract';
import { resolveFfmpegPath, resolveFfprobePath } from '../ffmpeg/binaries';
import { probeClips } from '../ffmpeg/probe';
import { generateThumbnails } from '../ffmpeg/thumbnail';
import { scanFolder } from '../services/clipScanner';
import { runConcat } from '../ffmpeg/concat';

export function registerIpcHandlers(
  ipcMain: IpcMain,
  getMainWindow: () => BrowserWindow | null,
): void {
  // --- M0 -----------------------------------------------------------
  ipcMain.handle(CH.FFMPEG_PATHS, async (): Promise<FfmpegPaths> => ({
    ffmpeg: resolveFfmpegPath(),
    ffprobe: resolveFfprobePath(),
  }));

  // --- M1 dialogs ---------------------------------------------------
  ipcMain.handle(
    CH.DIALOG_PICK_FOLDER,
    async (): Promise<string | null> => {
      const win = getMainWindow();
      if (!win) return null;
      const result = await dialog.showOpenDialog(win, {
        title: 'Select clip folder',
        properties: ['openDirectory'],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
  );

  ipcMain.handle(
    CH.DIALOG_PICK_OUTPUT,
    async (_event, defaultName: string): Promise<string | null> => {
      const win = getMainWindow();
      if (!win) return null;
      const result = await dialog.showSaveDialog(win, {
        title: 'Save stitched output',
        defaultPath: defaultName,
        filters: [
          { name: 'Matroska video', extensions: ['mkv'] },
          { name: 'MPEG-4 video', extensions: ['mp4'] },
        ],
      });
      return result.canceled ? null : (result.filePath ?? null);
    },
  );

  // --- M1 scan ------------------------------------------------------
  ipcMain.handle(
    CH.CLIPS_SCAN,
    async (_event, folder: string): Promise<ClipScanResult> => {
      return await scanFolder(folder);
    },
  );

  ipcMain.handle(
    CH.CLIPS_PROBE,
    async (_event, paths: string[]): Promise<ClipProbeResult[]> => {
      return await probeClips(paths);
    },
  );

  ipcMain.handle(
    CH.CLIPS_THUMBNAIL,
    async (
      _event,
      requests: ClipThumbnailRequest[],
    ): Promise<ClipThumbnailResult[]> => {
      return await generateThumbnails(requests);
    },
  );

  // --- M1 stitch ----------------------------------------------------
  const jobs = new Map<string, AbortController>();

  ipcMain.handle(
    CH.JOB_START,
    async (_event, opts: StitchOptions): Promise<string> => {
      const jobId = randomUUID();
      const ctrl = new AbortController();
      jobs.set(jobId, ctrl);

      const sendProgress = (p: JobProgress) => {
        getMainWindow()?.webContents.send(CH.JOB_PROGRESS, p);
      };
      const sendDone = (d: JobDone) => {
        getMainWindow()?.webContents.send(CH.JOB_DONE, d);
      };

      runConcat(
        {
          jobId,
          inputs: opts.inputs,
          output: opts.output,
          totalBytes: opts.totalBytes,
          onProgress: (tick) => {
            const bytes = tick.totalSize ?? 0;
            const fraction =
              opts.totalBytes > 0
                ? Math.min(1, bytes / opts.totalBytes)
                : 0;
            sendProgress({
              jobId,
              bytesWritten: bytes,
              outTimeMs: tick.outTimeMs ?? 0,
              speed: tick.speed ?? '',
              fraction,
            });
          },
        },
        ctrl.signal,
      )
        .then((result) => {
          sendDone({
            jobId,
            status: 'success',
            output: result.output,
            durationMs: result.durationMs,
          });
        })
        .catch((err: Error & { cancelled?: boolean }) => {
          if (err.cancelled || ctrl.signal.aborted) {
            sendDone({ jobId, status: 'cancelled' });
          } else {
            sendDone({
              jobId,
              status: 'error',
              error: String(err?.message ?? err),
            });
          }
        })
        .finally(() => {
          jobs.delete(jobId);
        });

      return jobId;
    },
  );

  ipcMain.handle(
    CH.JOB_CANCEL,
    async (_event, jobId: string): Promise<void> => {
      jobs.get(jobId)?.abort();
    },
  );

  // --- M1 shell -----------------------------------------------------
  ipcMain.handle(
    CH.APP_OPEN_PATH,
    async (_event, filePath: string): Promise<void> => {
      // Opens the parent dir and highlights the file in Explorer.
      shell.showItemInFolder(filePath);
    },
  );
}
