import {
  type IpcMain,
  type BrowserWindow,
  dialog,
  shell,
} from 'electron';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CH } from '../../shared/ipc-channels';
import type {
  AppPreferences,
  ClipProbeResult,
  ClipScanResult,
  ClipThumbnailRequest,
  ClipThumbnailResult,
  FfmpegPaths,
  JobDone,
  JobProgress,
  PickOutputRequest,
  StitchOptions,
} from '../../shared/ipc-contract';
import { resolveFfmpegPath, resolveFfprobePath } from '../ffmpeg/binaries';
import { probeClips } from '../ffmpeg/probe';
import { generateThumbnails } from '../ffmpeg/thumbnail';
import { scanFolder } from '../services/clipScanner';
import { runConcat } from '../ffmpeg/concat';
import { runSplitSegments } from '../ffmpeg/split';
import {
  getPreferences,
  rememberLastFolder,
  rememberLastOutputPath,
} from '../services/preferences';

function buildOutputFilters(preferredFormat: AppPreferences['preferredOutputFormat']) {
  const mkv = { name: 'Matroska video', extensions: ['mkv'] };
  const mp4 = { name: 'MPEG-4 video', extensions: ['mp4'] };
  return preferredFormat === 'mp4' ? [mp4, mkv] : [mkv, mp4];
}

function buildDefaultOutputPath(
  request: PickOutputRequest,
  prefs: AppPreferences,
): string {
  if (request.currentOutputPath) {
    return request.currentOutputPath;
  }

  const filename = `${request.suggestedStem}.${prefs.preferredOutputFormat}`;
  if (prefs.lastOutputPath) {
    return path.join(path.dirname(prefs.lastOutputPath), filename);
  }
  if (prefs.lastFolder) {
    return path.join(prefs.lastFolder, filename);
  }
  return filename;
}

function clampFraction(value: number | null): number {
  if (value == null || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export function registerIpcHandlers(
  ipcMain: IpcMain,
  getMainWindow: () => BrowserWindow | null,
): void {
  // --- M0 -----------------------------------------------------------
  ipcMain.handle(CH.FFMPEG_PATHS, async (): Promise<FfmpegPaths> => ({
    ffmpeg: resolveFfmpegPath(),
    ffprobe: resolveFfprobePath(),
  }));
  ipcMain.handle(
    CH.APP_PREFERENCES_GET,
    async (): Promise<AppPreferences> => getPreferences(),
  );

  // --- M1 dialogs ---------------------------------------------------
  ipcMain.handle(
    CH.DIALOG_PICK_FOLDER,
    async (): Promise<string | null> => {
      const win = getMainWindow();
      if (!win) return null;
      const prefs = getPreferences();
      const result = await dialog.showOpenDialog(win, {
        title: 'Select clip folder',
        properties: ['openDirectory'],
        defaultPath: prefs.lastFolder ?? undefined,
      });
      const folderPath = result.canceled ? null : (result.filePaths[0] ?? null);
      if (folderPath) {
        rememberLastFolder(folderPath);
      }
      return folderPath;
    },
  );

  ipcMain.handle(
    CH.DIALOG_PICK_OUTPUT,
    async (_event, request: PickOutputRequest): Promise<string | null> => {
      const win = getMainWindow();
      if (!win) return null;
      const prefs = getPreferences();
      const result = await dialog.showSaveDialog(win, {
        title: 'Save stitched output',
        defaultPath: buildDefaultOutputPath(request, prefs),
        filters: buildOutputFilters(prefs.preferredOutputFormat),
      });
      const outputPath = result.canceled ? null : (result.filePath ?? null);
      if (outputPath) {
        rememberLastOutputPath(outputPath);
      }
      return outputPath;
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
      const startedAt = Date.now();
      const hasSplitStage = opts.splitPointsMs.length > 0;

      const sendProgress = (p: JobProgress) => {
        getMainWindow()?.webContents.send(CH.JOB_PROGRESS, p);
      };
      const sendDone = (d: JobDone) => {
        getMainWindow()?.webContents.send(CH.JOB_DONE, d);
      };

      void (async () => {
        let splitOutputs: string[] = [];

        const computeStageFraction = (
          bytes: number,
          outTimeMs: number | null | undefined,
        ): number => {
          const timeFraction =
            opts.expectedDurationMs != null &&
            opts.expectedDurationMs > 0 &&
            outTimeMs != null
              ? outTimeMs / opts.expectedDurationMs
              : null;
          const byteFraction =
            opts.totalBytes > 0 ? bytes / opts.totalBytes : null;
          return clampFraction(timeFraction ?? byteFraction);
        };

        try {
          await runConcat(
            {
              jobId,
              inputs: opts.inputs,
              output: opts.output,
              mode: opts.mode,
              totalBytes: opts.totalBytes,
              onProgress: (tick) => {
                const stageFraction = computeStageFraction(
                  tick.totalSize ?? 0,
                  tick.outTimeMs,
                );
                sendProgress({
                  jobId,
                  stage: 'stitch',
                  stageLabel: hasSplitStage
                    ? 'Stitching full timeline'
                    : 'Stitching',
                  bytesWritten: tick.totalSize ?? 0,
                  outTimeMs: tick.outTimeMs ?? 0,
                  speed: tick.speed ?? '',
                  fraction: hasSplitStage ? stageFraction * 0.5 : stageFraction,
                });
              },
            },
            ctrl.signal,
          );

          if (hasSplitStage) {
            const splitResult = await runSplitSegments(
              {
                input: opts.output,
                splitPointsMs: opts.splitPointsMs,
                onProgress: (tick) => {
                  const stageFraction = computeStageFraction(
                    tick.totalSize ?? 0,
                    tick.outTimeMs,
                  );
                  sendProgress({
                    jobId,
                    stage: 'split',
                    stageLabel: `Creating ${opts.splitPointsMs.length + 1} split files`,
                    bytesWritten: tick.totalSize ?? 0,
                    outTimeMs: tick.outTimeMs ?? 0,
                    speed: tick.speed ?? '',
                    fraction: 0.5 + stageFraction * 0.5,
                  });
                },
              },
              ctrl.signal,
            );
            splitOutputs = splitResult.outputs;
          }

          sendDone({
            jobId,
            status: 'success',
            output: opts.output,
            splitOutputs,
            durationMs: Date.now() - startedAt,
          });
        } catch (err) {
          const typedError = err as Error & { cancelled?: boolean };
          if (typedError.cancelled || ctrl.signal.aborted) {
            sendDone({ jobId, status: 'cancelled' });
          } else {
            sendDone({
              jobId,
              status: 'error',
              error: String(typedError?.message ?? typedError),
            });
          }
        } finally {
          jobs.delete(jobId);
        }
      })();

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
