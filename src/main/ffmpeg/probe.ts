import { spawn } from 'node:child_process';
import type {
  ClipMetadata,
  ClipProbeResult,
} from '../../shared/ipc-contract';
import { resolveFfprobePath } from './binaries';

const PROBE_CONCURRENCY = 4;

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
  duration?: string;
}

interface FfprobeJson {
  format?: {
    duration?: string;
  };
  streams?: FfprobeStream[];
}

function parseNumber(value: number | string | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDurationMs(data: FfprobeJson): number | null {
  const videoStream = data.streams?.find((stream) => stream.codec_type === 'video');
  const audioStream = data.streams?.find((stream) => stream.codec_type === 'audio');
  const seconds =
    parseNumber(data.format?.duration) ??
    parseNumber(videoStream?.duration) ??
    parseNumber(audioStream?.duration);

  return seconds == null ? null : Math.max(0, Math.round(seconds * 1000));
}

function parseFrameRate(stream: FfprobeStream | undefined): string | null {
  const value = stream?.avg_frame_rate ?? stream?.r_frame_rate ?? null;
  if (!value || value === '0/0') {
    return null;
  }
  return value;
}

function normalizeMetadata(data: FfprobeJson): ClipMetadata {
  const videoStream = data.streams?.find((stream) => stream.codec_type === 'video');
  const audioStream = data.streams?.find((stream) => stream.codec_type === 'audio');

  return {
    durationMs: parseDurationMs(data),
    videoCodec: videoStream?.codec_name ?? null,
    audioCodec: audioStream?.codec_name ?? null,
    width: parseNumber(videoStream?.width),
    height: parseNumber(videoStream?.height),
    pixelFormat: videoStream?.pix_fmt ?? null,
    frameRate: parseFrameRate(videoStream),
    sampleRate: parseNumber(audioStream?.sample_rate),
    channels: parseNumber(audioStream?.channels),
    channelLayout: audioStream?.channel_layout ?? null,
  };
}

export async function probeClip(filePath: string): Promise<ClipMetadata> {
  const ffprobe = resolveFfprobePath();

  return await new Promise<ClipMetadata>((resolve, reject) => {
    const child = spawn(
      ffprobe,
      [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        filePath,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stdout = '';
    let stderr = '';

    child.stdout?.setEncoding('utf-8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });

    child.stderr?.setEncoding('utf-8');
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', reject);

    child.on('close', (code, signal) => {
      if (signal) {
        reject(new Error(`ffprobe killed by signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(
          new Error(
            `ffprobe exited ${code} for ${filePath}\n${stderr.trim()}`,
          ),
        );
        return;
      }

      try {
        resolve(normalizeMetadata(JSON.parse(stdout) as FfprobeJson));
      } catch (error) {
        reject(
          new Error(
            `Unable to parse ffprobe output for ${filePath}: ${String(error)}`,
          ),
        );
      }
    });
  });
}

export async function probeClips(
  paths: string[],
  concurrency = PROBE_CONCURRENCY,
): Promise<ClipProbeResult[]> {
  if (paths.length === 0) {
    return [];
  }

  const results = new Array<ClipProbeResult>(paths.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, paths.length));

  async function worker(): Promise<void> {
    while (nextIndex < paths.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      const filePath = paths[currentIndex];
      try {
        results[currentIndex] = {
          path: filePath,
          metadata: await probeClip(filePath),
          error: null,
        };
      } catch (error) {
        results[currentIndex] = {
          path: filePath,
          metadata: null,
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
