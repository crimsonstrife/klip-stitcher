import path from 'node:path';
import type { JobErrorInfo } from '../../shared/ipc-contract';

export type FfmpegOperation = 'stitch' | 'split' | 'chapter-export';

interface FfmpegProcessErrorOptions {
  operation: FfmpegOperation;
  exitCode?: number | null;
  signalName?: NodeJS.Signals | null;
  stderr?: string;
  input?: string | null;
  output?: string | null;
}

function normalizeExitCode(code: number | null | undefined): number | null {
  if (code == null || !Number.isFinite(code)) {
    return null;
  }
  return code > 0x7fffffff ? code - 0x100000000 : code;
}

function formatExitCode(code: number | null): string | null {
  if (code == null) {
    return null;
  }
  return String(normalizeExitCode(code));
}

function getOperationLabel(operation: FfmpegOperation): string {
  switch (operation) {
    case 'stitch':
      return 'stitch';
    case 'split':
      return 'split export';
    case 'chapter-export':
      return 'chapter export';
    default: {
      const exhaustiveCheck: never = operation;
      return String(exhaustiveCheck);
    }
  }
}

function getOperationGerund(operation: FfmpegOperation): string {
  switch (operation) {
    case 'stitch':
      return 'stitching';
    case 'split':
      return 'creating split files';
    case 'chapter-export':
      return 'creating chapter files';
    default: {
      const exhaustiveCheck: never = operation;
      return String(exhaustiveCheck);
    }
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'message' in error;
}

function uniqueLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const line of lines) {
    if (seen.has(line)) {
      continue;
    }
    seen.add(line);
    deduped.push(line);
  }
  return deduped;
}

function extractRelevantStderrLines(stderr: string): string[] {
  const lines = stderr
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return [];
  }

  const relevantPatterns = [
    /error /iu,
    /failed/iu,
    /unable to/iu,
    /permission denied/iu,
    /access is denied/iu,
    /no such file or directory/iu,
    /no space left on device/iu,
    /there is not enough space/iu,
    /invalid data/iu,
  ];
  const relevant = lines.filter((line) =>
    relevantPatterns.some((pattern) => pattern.test(line)),
  );

  return uniqueLines(relevant.length > 0 ? relevant.slice(-12) : lines.slice(-12));
}

function buildTechnicalDetails(error: FfmpegProcessError): string | null {
  const details: string[] = [];
  const exitCode = formatExitCode(error.exitCode);

  details.push(`Operation: ${getOperationLabel(error.operation)}`);
  if (exitCode) {
    details.push(`FFmpeg exit code: ${exitCode}`);
  }
  if (error.signalName) {
    details.push(`Signal: ${error.signalName}`);
  }
  if (error.output) {
    details.push(`Output: ${error.output}`);
  }
  if (error.input) {
    details.push(`Input: ${error.input}`);
  }

  const stderrLines = extractRelevantStderrLines(error.stderr);
  if (stderrLines.length > 0) {
    details.push('', ...stderrLines);
  }

  return details.length > 0 ? details.join('\n') : null;
}

function buildFilesystemErrorInfo(
  title: string,
  message: string,
  suggestions: string[],
  error: NodeJS.ErrnoException,
): JobErrorInfo {
  const details = [
    error.code ? `Code: ${error.code}` : null,
    error.path ? `Path: ${error.path}` : null,
    error.message ? `Message: ${error.message}` : null,
  ].filter((line): line is string => Boolean(line));

  return {
    title,
    message,
    suggestions,
    technicalDetails: details.length > 0 ? details.join('\n') : null,
  };
}

export class FfmpegProcessError extends Error {
  readonly operation: FfmpegOperation;
  readonly exitCode: number | null;
  readonly signalName: NodeJS.Signals | null;
  readonly stderr: string;
  readonly input: string | null;
  readonly output: string | null;

  constructor(options: FfmpegProcessErrorOptions) {
    const exitCode = normalizeExitCode(options.exitCode);
    const operationLabel = getOperationLabel(options.operation);
    super(
      exitCode != null
        ? `FFmpeg ${operationLabel} failed with exit code ${exitCode}`
        : `FFmpeg ${operationLabel} failed`,
    );
    this.name = 'FfmpegProcessError';
    this.operation = options.operation;
    this.exitCode = exitCode;
    this.signalName = options.signalName ?? null;
    this.stderr = options.stderr ?? '';
    this.input = options.input ?? null;
    this.output = options.output ?? null;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function formatJobError(error: unknown): JobErrorInfo {
  if (error instanceof FfmpegProcessError) {
    const stderr = error.stderr;
    const lower = stderr.toLowerCase();
    const outputExt = error.output ? path.extname(error.output).toLowerCase() : '';
    const hasNoSpace =
      lower.includes('no space left on device') ||
      lower.includes('there is not enough space');
    const hasPermissionDenied =
      lower.includes('permission denied') || lower.includes('access is denied');
    const hasMissingInput =
      lower.includes('error during demuxing: no such file or directory') ||
      lower.includes('impossible to open') ||
      lower.includes('error opening input');
    const hasMissingOutput =
      lower.includes('error submitting a packet to the muxer: no such file or directory') ||
      lower.includes('unable to re-open') ||
      lower.includes('error writing trailer: no such file or directory') ||
      lower.includes('error closing file: no such file or directory');
    const technicalDetails = buildTechnicalDetails(error);
    const gerund = getOperationGerund(error.operation);

    if (hasNoSpace) {
      return {
        title: 'Destination drive ran out of space',
        message: `FFmpeg could not finish ${gerund} because the destination drive ran out of free space.`,
        suggestions: [
          'Free up space or choose a different output location, then run the job again.',
          'If a partial output file was left behind, the next run will overwrite it.',
        ],
        technicalDetails,
      };
    }

    if (hasPermissionDenied) {
      return {
        title: 'Windows denied file access',
        message: `FFmpeg could not keep ${gerund} because Windows denied access to one of the media files.`,
        suggestions: [
          'Make sure the source and output locations are writable and not locked by another app.',
          'If the file is on a sync service or NAS share, confirm it is still connected before retrying.',
        ],
        technicalDetails,
      };
    }

    if (hasMissingInput && hasMissingOutput) {
      return {
        title: 'Lost access to the media files during processing',
        message:
          'One or more source or destination files disappeared while FFmpeg was still running. This usually means the source folder or output destination went offline, such as a NAS disconnect or mapped drive drop.',
        suggestions: [
          'Reconnect both the source folder and the output destination, then run the job again.',
          outputExt === '.mp4'
            ? 'Because the MP4 could not be finalized, treat any partial output as incomplete.'
            : 'If a partial output file was left behind, rerunning the job will overwrite it.',
        ],
        technicalDetails,
      };
    }

    if (hasMissingOutput) {
      return {
        title: 'Lost access to the output file',
        message:
          outputExt === '.mp4'
            ? 'FFmpeg lost access to the destination file while finalizing the MP4. This often means the destination drive or network share disconnected mid-job.'
            : 'FFmpeg lost access to the destination file while writing output. This often means the destination drive or network share disconnected mid-job.',
        suggestions: [
          'Reconnect the destination drive or share, then run the job again.',
          outputExt === '.mp4'
            ? 'If a partial MP4 exists, treat it as incomplete because FFmpeg could not finish the final trailer step.'
            : 'If a partial output file exists, rerunning the job will overwrite it.',
        ],
        technicalDetails,
      };
    }

    if (hasMissingInput) {
      return {
        title: 'Lost access to a source file',
        message:
          'FFmpeg could no longer read one of the input files while the job was running. This often means the source drive or network share disconnected mid-job.',
        suggestions: [
          'Reconnect the source folder, then run the job again.',
          'If you are reading from a NAS or mapped drive, copying the clips locally first will avoid this class of interruption.',
        ],
        technicalDetails,
      };
    }

    if (lower.includes('invalid data found when processing input')) {
      return {
        title: 'One of the input files became unreadable',
        message:
          'FFmpeg reported invalid media data while processing the files. A clip may be incomplete or corrupted.',
        suggestions: [
          'Try excluding the affected clip or restitching from a clean copy of the recordings.',
        ],
        technicalDetails,
      };
    }

    return {
      title: `FFmpeg ${getOperationLabel(error.operation)} failed`,
      message: `FFmpeg reported an error while ${gerund}.`,
      suggestions: [
        'Review the technical details below for the exact FFmpeg messages.',
      ],
      technicalDetails,
    };
  }

  if (isNodeError(error)) {
    switch (error.code) {
      case 'ENOENT':
        return buildFilesystemErrorInfo(
          'A required file or folder was not found',
          'The job could not continue because a source file, output folder, or temporary file path disappeared.',
          [
            'If you are working from a NAS or mapped drive, reconnect it and try again.',
          ],
          error,
        );
      case 'ENOSPC':
        return buildFilesystemErrorInfo(
          'Destination drive ran out of space',
          'The job could not continue because the destination drive is full.',
          ['Free up space or choose another output location, then try again.'],
          error,
        );
      case 'EACCES':
      case 'EPERM':
        return buildFilesystemErrorInfo(
          'Windows denied file access',
          'The job could not continue because Windows denied access to one of the files it needed.',
          [
            'Check folder permissions and make sure another app is not locking the same file.',
          ],
          error,
        );
      default:
        return buildFilesystemErrorInfo(
          'The job failed',
          error.message,
          [],
          error,
        );
    }
  }

  return {
    title: 'The job failed',
    message: error instanceof Error ? error.message : String(error),
    suggestions: [],
    technicalDetails: null,
  };
}
