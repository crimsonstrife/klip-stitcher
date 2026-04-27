import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { OutputFormat } from '../../shared/ipc-contract';
import { resolveFfmpegPath } from './binaries';
import { FfmpegProcessError } from './errors';
import { makeProgressReader, type ProgressTick } from './progress';

export interface SplitJob {
  input: string;
  splitPointsMs: number[];
  onProgress: (tick: ProgressTick) => void;
}

export interface SplitResult {
  outputs: string[];
  durationMs: number;
}

function logOutputEnumerationFailure(error: unknown): void {
  console.warn('Failed to inspect generated split files.', error);
}

function inferOutputFormat(filePath: string): OutputFormat {
  return path.extname(filePath).toLowerCase() === '.mp4' ? 'mp4' : 'mkv';
}

function getSegmentFormat(outputFormat: OutputFormat): string {
  return outputFormat === 'mp4' ? 'mp4' : 'matroska';
}

function formatSegmentSeconds(pointMs: number): string {
  return (pointMs / 1000).toFixed(3).replace(/\.?0+$/u, '');
}

function getSplitOutputs(input: string, segmentCount: number): {
  outputPattern: string;
  outputs: string[];
} {
  const parsed = path.parse(input);
  const numberWidth = Math.max(3, String(segmentCount).length);
  const outputPattern = path.join(
    parsed.dir,
    `${parsed.name}-part-%0${numberWidth}d${parsed.ext}`,
  );
  const outputs = Array.from({ length: segmentCount }, (_value, index) =>
    path.join(
      parsed.dir,
      `${parsed.name}-part-${String(index + 1).padStart(numberWidth, '0')}${parsed.ext}`,
    ),
  );
  return { outputPattern, outputs };
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

export async function runSplitSegments(
  job: SplitJob,
  signal: AbortSignal,
): Promise<SplitResult> {
  const splitPointsMs = [...job.splitPointsMs]
    .filter((pointMs) => Number.isFinite(pointMs) && pointMs > 0)
    .sort((a, b) => a - b)
    .filter((pointMs, index, points) => index === 0 || points[index - 1] !== pointMs);

  if (splitPointsMs.length === 0) {
    return { outputs: [], durationMs: 0 };
  }
  if (signal.aborted) {
    const error: Error & { cancelled?: boolean } = new Error('cancelled');
    error.cancelled = true;
    throw error;
  }

  const ffmpeg = resolveFfmpegPath();
  const startedAt = Date.now();
  const segmentCount = splitPointsMs.length + 1;
  const outputFormat = inferOutputFormat(job.input);
  const { outputPattern, outputs } = getSplitOutputs(job.input, segmentCount);
  const segmentTimes = splitPointsMs.map(formatSegmentSeconds).join(',');
  await removePreexistingOutputs(outputs);

  return await new Promise<SplitResult>((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-y',
      '-i',
      job.input,
      '-map',
      '0',
      '-c',
      'copy',
      '-avoid_negative_ts',
      'make_zero',
      '-fflags',
      '+genpts',
      '-reset_timestamps',
      '1',
      '-f',
      'segment',
      '-segment_format',
      getSegmentFormat(outputFormat),
      '-segment_times',
      segmentTimes,
      '-start_number',
      '1',
      ...(outputFormat === 'mp4'
        ? ['-segment_format_options', 'movflags=+faststart']
        : []),
      '-progress',
      'pipe:1',
      '-nostats',
      outputPattern,
    ];

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
            operation: 'split',
            signalName: sigName,
            stderr: stderrBuf,
            input: job.input,
            output: outputPattern,
          }),
        );
        return;
      }
      if (code !== 0) {
        reject(
          new FfmpegProcessError({
            operation: 'split',
            exitCode: code,
            stderr: stderrBuf,
            input: job.input,
            output: outputPattern,
          }),
        );
        return;
      }

      fs.access(outputs[outputs.length - 1])
        .catch(logOutputEnumerationFailure)
        .finally(() => {
          resolve({
            outputs,
            durationMs: Date.now() - startedAt,
          });
        });
    });
  });
}
