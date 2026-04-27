import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { app } from 'electron';
import type { ResolvedStitchMode } from '../../shared/ipc-contract';
import { resolveFfmpegPath } from './binaries';
import { FfmpegProcessError } from './errors';
import { makeProgressReader, type ProgressTick } from './progress';

export interface ConcatJob {
  jobId: string;
  inputs: string[];
  output: string;
  mode: ResolvedStitchMode;
  totalBytes: number;
  onProgress: (tick: ProgressTick) => void;
}

export interface ConcatResult {
  jobId: string;
  output: string;
  durationMs: number;
}

function logCleanupFailure(error: unknown): void {
  console.warn('Failed to remove temporary concat list file.', error);
}

/** Build a UTF-8 concat list (no BOM) per the demuxer's format. Single-quote
 *  each path; escape any literal apostrophe as `'\''`. Backslashes inside a
 *  single-quoted concat-list path are NOT escape characters, so Windows
 *  absolute paths work as-is. */
async function buildConcatListFile(
  jobId: string,
  inputs: string[],
): Promise<string> {
  const listPath = path.join(app.getPath('userData'), `concat-${jobId}.txt`);
  const lines = inputs
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join('\n');
  await fs.writeFile(listPath, lines + '\n', { encoding: 'utf-8' });
  return listPath;
}

function buildFfmpegArgs(listPath: string, job: ConcatJob): string[] {
  const inputArgs = [
    '-hide_banner',
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
  ];
  const progressArgs = ['-progress', 'pipe:1', '-nostats'];
  const timestampArgs = ['-avoid_negative_ts', 'make_zero', '-fflags', '+genpts'];

  switch (job.mode) {
    case 'copy-mkv':
      return [
        ...inputArgs,
        '-c',
        'copy',
        '-map',
        '0',
        ...timestampArgs,
        ...progressArgs,
        job.output,
      ];
    case 'remux-mp4':
      return [
        ...inputArgs,
        '-c',
        'copy',
        '-map',
        '0',
        '-movflags',
        '+faststart',
        ...timestampArgs,
        ...progressArgs,
        job.output,
      ];
    case 'reencode-mkv':
      return [
        ...inputArgs,
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '18',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-af',
        'aresample=async=1:first_pts=0',
        ...timestampArgs,
        ...progressArgs,
        job.output,
      ];
    case 'reencode-mp4':
      return [
        ...inputArgs,
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '18',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-af',
        'aresample=async=1:first_pts=0',
        '-movflags',
        '+faststart',
        ...timestampArgs,
        ...progressArgs,
        job.output,
      ];
    default: {
      const exhaustiveCheck: never = job.mode;
      throw new Error(`Unsupported stitch mode: ${String(exhaustiveCheck)}`);
    }
  }
}

/** Run ffmpeg's stream-copy concat (`-c copy`). Honours the AbortSignal —
 *  aborting will SIGTERM the ffmpeg child and reject the promise. */
export async function runConcat(
  job: ConcatJob,
  signal: AbortSignal,
): Promise<ConcatResult> {
  if (signal.aborted) {
    const e: Error & { cancelled?: boolean } = new Error('cancelled');
    e.cancelled = true;
    throw e;
  }

  const ffmpeg = resolveFfmpegPath();
  const listPath = await buildConcatListFile(job.jobId, job.inputs);
  const startedAt = Date.now();

  return await new Promise<ConcatResult>((resolve, reject) => {
    const args = buildFfmpegArgs(listPath, job);

    const child = spawn(ffmpeg, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const reader = makeProgressReader(job.onProgress);
    child.stdout?.setEncoding('utf-8');
    child.stdout?.on('data', reader);

    let stderrBuf = '';
    child.stderr?.setEncoding('utf-8');
    child.stderr?.on('data', (chunk: string) => {
      stderrBuf += chunk;
      // Cap to avoid unbounded memory if ffmpeg gets chatty.
      if (stderrBuf.length > 64_000) {
        stderrBuf = stderrBuf.slice(-64_000);
      }
    });

    const onAbort = () => {
      child.kill('SIGTERM');
    };
    signal.addEventListener('abort', onAbort);

    child.on('error', (err) => {
      signal.removeEventListener('abort', onAbort);
      void fs.unlink(listPath).catch(logCleanupFailure);
      reject(err);
    });

    child.on('close', (code, sigName) => {
      signal.removeEventListener('abort', onAbort);
      void fs.unlink(listPath).catch(logCleanupFailure);

      if (signal.aborted) {
        const e: Error & { cancelled?: boolean } = new Error('cancelled');
        e.cancelled = true;
        reject(e);
        return;
      }
      if (sigName) {
        reject(
          new FfmpegProcessError({
            operation: 'stitch',
            signalName: sigName,
            stderr: stderrBuf,
            output: job.output,
          }),
        );
        return;
      }
      if (code !== 0) {
        reject(
          new FfmpegProcessError({
            operation: 'stitch',
            exitCode: code,
            stderr: stderrBuf,
            output: job.output,
          }),
        );
        return;
      }
      resolve({
        jobId: job.jobId,
        output: job.output,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}
