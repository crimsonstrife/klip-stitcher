import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import { pathToFileURL } from 'node:url';
import type {
  ClipThumbnailRequest,
  ClipThumbnailResult,
} from '../../shared/ipc-contract';
import { resolveFfmpegPath } from './binaries';

const THUMBNAIL_CONCURRENCY = 2;
const THUMBNAIL_WIDTH = 240;
const THUMBNAIL_FORMAT = 'mjpeg';
const THUMBNAIL_TIME_SECONDS = 1;

function getThumbsDir(): string {
  return path.join(app.getPath('userData'), 'thumbs');
}

function buildThumbnailPath(request: ClipThumbnailRequest): string {
  const key = createHash('sha1')
    .update(`${request.path}|${request.mtime}`)
    .digest('hex');
  return path.join(getThumbsDir(), `${key}.jpg`);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureThumbsDir(): Promise<void> {
  await fs.mkdir(getThumbsDir(), { recursive: true });
}

function toFileUrl(filePath: string): string {
  return pathToFileURL(filePath).href;
}

async function renderThumbnail(
  inputPath: string,
  outputPath: string,
  seekSeconds: number,
): Promise<void> {
  const ffmpeg = resolveFfmpegPath();

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      ffmpeg,
      [
        '-hide_banner',
        '-y',
        '-ss',
        seekSeconds.toFixed(3),
        '-i',
        inputPath,
        '-frames:v',
        '1',
        '-vf',
        `scale=${THUMBNAIL_WIDTH}:-1`,
        '-f',
        THUMBNAIL_FORMAT,
        outputPath,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );

    let stderr = '';
    child.stderr?.setEncoding('utf-8');
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (signal) {
        reject(new Error(`ffmpeg killed by signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(
          new Error(
            `ffmpeg thumbnail exited ${code} for ${inputPath}\n${stderr.trim()}`,
          ),
        );
        return;
      }
      resolve();
    });
  });
}

async function createThumbnail(
  request: ClipThumbnailRequest,
): Promise<string> {
  await ensureThumbsDir();

  const outputPath = buildThumbnailPath(request);
  if (await fileExists(outputPath)) {
    return toFileUrl(outputPath);
  }

  try {
    await renderThumbnail(request.path, outputPath, THUMBNAIL_TIME_SECONDS);
  } catch (error) {
    // Very short clips can fail at t=1s; retry near the start.
    await renderThumbnail(request.path, outputPath, 0);
    if (error instanceof Error) {
      console.warn(
        'Thumbnail generation retried at t=0 for short clip.',
        request.path,
        error.message,
      );
    }
  }

  return toFileUrl(outputPath);
}

export async function generateThumbnails(
  requests: ClipThumbnailRequest[],
  concurrency = THUMBNAIL_CONCURRENCY,
): Promise<ClipThumbnailResult[]> {
  if (requests.length === 0) {
    return [];
  }

  const results = new Array<ClipThumbnailResult>(requests.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, requests.length));

  async function worker(): Promise<void> {
    while (nextIndex < requests.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      const request = requests[currentIndex];
      try {
        results[currentIndex] = {
          path: request.path,
          thumbnailUrl: await createThumbnail(request),
          error: null,
        };
      } catch (error) {
        results[currentIndex] = {
          path: request.path,
          thumbnailUrl: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      await worker();
    }),
  );

  return results;
}
