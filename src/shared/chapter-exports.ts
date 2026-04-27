import type { PostStitchExport } from './ipc-contract';
import { parseTimestampToken } from './split-points';

export interface ParsedChapterExports {
  exports: PostStitchExport[];
  errors: string[];
  warnings: string[];
}

function formatTimestampForMessage(ms: number): string {
  const totalSeconds = ms / 1000;
  const wholeSeconds = Math.floor(totalSeconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function buildChapterOutputPath(
  stitchedOutput: string,
  index: number,
  totalCount: number,
): string {
  const slashIndex = Math.max(
    stitchedOutput.lastIndexOf('/'),
    stitchedOutput.lastIndexOf('\\'),
  );
  const directory = slashIndex >= 0 ? stitchedOutput.slice(0, slashIndex + 1) : '';
  const filename = slashIndex >= 0 ? stitchedOutput.slice(slashIndex + 1) : stitchedOutput;
  const extIndex = filename.lastIndexOf('.');
  const name = extIndex > 0 ? filename.slice(0, extIndex) : filename;
  const ext = extIndex > 0 ? filename.slice(extIndex) : '';
  const width = Math.max(3, String(totalCount).length);
  return `${directory}${name}-chapter-${String(index + 1).padStart(width, '0')}${ext}`;
}

export function parseVodChapterExports(args: {
  rawValue: string;
  stitchedOutput: string | null;
  durationMs: number | null;
  preRollMs: number;
  postRollMs: number;
}): ParsedChapterExports {
  const { rawValue, stitchedOutput, durationMs, preRollMs, postRollMs } = args;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!stitchedOutput) {
    errors.push('Choose an output file before building chapter exports.');
    return { exports: [], errors, warnings };
  }
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs <= 0) {
    errors.push('Chapter mode needs a known stitched duration.');
    return { exports: [], errors, warnings };
  }

  const rows = rawValue
    .split(/\r?\n/u)
    .map((row) => row.trim())
    .filter((row) => row !== '');
  if (rows.length === 0) {
    errors.push('Paste at least one VOD marker row.');
    return { exports: [], errors, warnings };
  }

  const rawMarkers: Array<{ raw: string; source: string; lineNumber: number }> = [];
  rows.forEach((row, index) => {
    const source = row.split(/[\t,]/u)[0]?.trim() ?? '';
    const parsedMs = parseTimestampToken(source);
    if (parsedMs == null) {
      errors.push(`Could not parse the timestamp on line ${index + 1}.`);
      return;
    }
    rawMarkers.push({
      raw: source,
      source: row,
      lineNumber: index + 1,
    });
  });

  if (errors.length > 0) {
    return { exports: [], errors, warnings };
  }

  const parsedMarkerMs = rawMarkers
    .map((marker) => ({
      ...marker,
      ms: parseTimestampToken(marker.raw) ?? 0,
    }));

  if (
    parsedMarkerMs.some(
      (marker, index) => index > 0 && marker.ms < parsedMarkerMs[index - 1].ms,
    )
  ) {
    warnings.push('Markers were normalized into ascending timestamp order.');
  }
  parsedMarkerMs.sort((a, b) => a.ms - b.ms);

  const recordingAnchorMs = parsedMarkerMs[0]?.ms ?? 0;
  const alignedMarkers = parsedMarkerMs
    .map((marker) => ({
      ...marker,
      alignedMs: marker.ms - recordingAnchorMs,
    }))
    .filter((marker) => {
      if (marker.alignedMs >= durationMs) {
        warnings.push(
          `Ignored marker ${marker.raw} because it falls after the recording ends once aligned.`,
        );
        return false;
      }
      return true;
    })
    .filter((marker, index, markers) => {
      if (index === 0 || markers[index - 1].alignedMs !== marker.alignedMs) {
        return true;
      }
      warnings.push(
        `Removed duplicate marker at ${formatTimestampForMessage(marker.alignedMs)} after alignment.`,
      );
      return false;
    });

  if (alignedMarkers.length === 0) {
    errors.push('No usable markers remain after aligning the VOD to the recording.');
    return { exports: [], errors, warnings };
  }

  const exports = alignedMarkers.map((marker, index) => {
    const nextMarkerMs = alignedMarkers[index + 1]?.alignedMs ?? durationMs;
    const startMs = Math.max(0, marker.alignedMs - preRollMs);
    const endMs = Math.min(durationMs, nextMarkerMs + postRollMs);
    return {
      label: `Chapter ${String(index + 1).padStart(3, '0')}`,
      output: buildChapterOutputPath(stitchedOutput, index, alignedMarkers.length),
      startMs,
      endMs,
    };
  });

  return { exports, errors, warnings };
}
