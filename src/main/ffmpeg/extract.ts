import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import type { PostStitchExport } from '../../shared/ipc-contract';
import { resolveFfmpegPath } from './binaries';
import { FfmpegProcessError } from './errors';
import { makeProgressReader } from './progress';

export interface RangeExportProgress {
  currentIndex: number;
  totalCount: number;
  fraction: number;
  bytesWritten: number;
  outTimeMs: number;
  speed: string;
}

export interface ExtractRangesJob {
  input: string;
  exports: PostStitchExport[];
  onProgress: (progress: RangeExportProgress) => void;
}

export interface ExtractRangesResult {
  outputs: string[];
  durationMs: number;
}

function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(3).replace(/\.?0+$/u, '');
}

async function removePreexistingOutputs(outputPaths: string[]): Promise<void> {
  await Promise.all(
    outputPaths.map(async (filePath) => {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code !== 'ENOENT') {
          throw error;
        }
      }
    }),
  );
}

async function runSingleRangeExport(args: {
  input: string;
  exportSpec: PostStitchExport;
  signal: AbortSignal;
  onProgress: (bytesWritten: number, outTimeMs: number, speed: string) => void;
}): Promise<void> {
  const { input, exportSpec, signal, onProgress } = args;
  const ffmpeg = resolveFfmpegPath();
  const segmentDurationMs = Math.max(1, exportSpec.endMs - exportSpec.startMs);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      ffmpeg,
      [
        '-hide_banner',
        '-y',
        '-ss',
        formatSeconds(exportSpec.startMs),
        '-i',
        input,
        '-map',
        '0',
        '-t',
        formatSeconds(segmentDurationMs),
        '-c',
        'copy',
        '-avoid_negative_ts',
        'make_zero',
        '-fflags',
        '+genpts',
        '-progress',
        'pipe:1',
        '-nostats',
        exportSpec.output,
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    const reader = makeProgressReader((tick) => {
      onProgress(tick.totalSize ?? 0, tick.outTimeMs ?? 0, tick.speed ?? '');
    });
    child.stdout?.setEncoding('utf-8');
    child.stdout?.on('data', reader);

    let stderrBuf = '';
    child.stderr?.setEncoding('utf-8');
    child.stderr?.on('data', (chunk: string) => {
      stderrBuf += chunk;
      if (stderrBuf.length > 64_000) {
        stderrBuf = stderrBuf.slice(-64_000);
      }
    });

    const onAbort = () => {
      child.kill('SIGTERM');
    };
    signal.addEventListener('abort', onAbort);

    child.on('error', (error) => {
      signal.removeEventListener('abort', onAbort);
      reject(error);
    });

    child.on('close', (code, sigName) => {
      signal.removeEventListener('abort', onAbort);

      if (signal.aborted) {
        const error: Error & { cancelled?: boolean } = new Error('cancelled');
        error.cancelled = true;
        reject(error);
        return;
      }
      if (sigName) {
        reject(
          new FfmpegProcessError({
            operation: 'chapter-export',
            signalName: sigName,
            stderr: stderrBuf,
            input,
            output: exportSpec.output,
          }),
        );
        return;
      }
      if (code !== 0) {
        reject(
          new FfmpegProcessError({
            operation: 'chapter-export',
            exitCode: code,
            stderr: stderrBuf,
            input,
            output: exportSpec.output,
          }),
        );
        return;
      }

      resolve();
    });
  });
}

export async function runExtractRanges(
  job: ExtractRangesJob,
  signal: AbortSignal,
): Promise<ExtractRangesResult> {
  const exports = job.exports.filter(
    (exportSpec) =>
      Number.isFinite(exportSpec.startMs) &&
      Number.isFinite(exportSpec.endMs) &&
      exportSpec.endMs > exportSpec.startMs,
  );
  if (exports.length === 0) {
    return { outputs: [], durationMs: 0 };
  }
  if (signal.aborted) {
    const error: Error & { cancelled?: boolean } = new Error('cancelled');
    error.cancelled = true;
    throw error;
  }

  await removePreexistingOutputs(exports.map((exportSpec) => exportSpec.output));
  const totalDurationMs = exports.reduce(
    (sum, exportSpec) => sum + (exportSpec.endMs - exportSpec.startMs),
    0,
  );
  const startedAt = Date.now();
  let completedDurationMs = 0;

  for (let index = 0; index < exports.length; index += 1) {
    const exportSpec = exports[index];
    const currentDurationMs = exportSpec.endMs - exportSpec.startMs;

    await runSingleRangeExport({
      input: job.input,
      exportSpec,
      signal,
      onProgress: (bytesWritten, outTimeMs, speed) => {
        const fraction =
          totalDurationMs > 0
            ? Math.min(
                1,
                (completedDurationMs + Math.min(outTimeMs, currentDurationMs)) /
                  totalDurationMs,
              )
            : 0;
        job.onProgress({
          currentIndex: index + 1,
          totalCount: exports.length,
          fraction,
          bytesWritten,
          outTimeMs,
          speed,
        });
      },
    });

    completedDurationMs += currentDurationMs;
  }

  return {
    outputs: exports.map((exportSpec) => exportSpec.output),
    durationMs: Date.now() - startedAt,
  };
}
