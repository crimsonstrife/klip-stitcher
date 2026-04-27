export interface ParsedSplitPoints {
  pointsMs: number[];
  errors: string[];
  warnings: string[];
}

function parseClockTimestamp(token: string): number | null {
  const parts = token.split(':').map((part) => part.trim());
  if (parts.length === 0 || parts.length > 3 || parts.some((part) => part === '')) {
    return null;
  }

  const reversed = [...parts].reverse();
  const seconds = Number(reversed[0]);
  const minutes = reversed[1] == null ? 0 : Number(reversed[1]);
  const hours = reversed[2] == null ? 0 : Number(reversed[2]);

  if (
    !Number.isFinite(seconds) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(hours)
  ) {
    return null;
  }
  if ((reversed[1] != null && (minutes < 0 || minutes >= 60)) || seconds < 0) {
    return null;
  }
  if (reversed[0].includes('.') && seconds >= 60 && parts.length > 1) {
    return null;
  }
  if (!reversed[0].includes('.') && seconds >= 60 && parts.length > 1) {
    return null;
  }

  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
}

export function parseTimestampToken(token: string): number | null {
  const trimmed = token.trim();
  if (trimmed === '') {
    return null;
  }
  if (/^\d+(?:\.\d+)?$/u.test(trimmed)) {
    return Math.round(Number(trimmed) * 1000);
  }
  if (/^[\d:.]+$/u.test(trimmed)) {
    return parseClockTimestamp(trimmed);
  }
  return null;
}

export function parseSplitPoints(
  rawValue: string,
  durationMs: number | null,
): ParsedSplitPoints {
  const tokens = rawValue
    .split(/[\n,;]+/u)
    .map((token) => token.trim())
    .filter((token) => token !== '');
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsedPoints: number[] = [];

  for (const token of tokens) {
    const pointMs = parseTimestampToken(token);
    if (pointMs == null) {
      errors.push(`Could not parse timestamp "${token}".`);
      continue;
    }
    if (pointMs <= 0) {
      errors.push(`Timestamp "${token}" must be greater than zero.`);
      continue;
    }
    if (durationMs != null && pointMs >= durationMs) {
      errors.push(`Timestamp "${token}" is beyond the stitched duration.`);
      continue;
    }
    parsedPoints.push(pointMs);
  }

  const ascendingPoints = [...parsedPoints].sort((a, b) => a - b);
  if (
    parsedPoints.length > 1 &&
    ascendingPoints.some((point, index) => point !== parsedPoints[index])
  ) {
    warnings.push('Split timestamps were normalized into ascending order.');
  }

  const dedupedPoints = ascendingPoints.filter(
    (point, index) => index === 0 || ascendingPoints[index - 1] !== point,
  );
  if (dedupedPoints.length !== ascendingPoints.length) {
    warnings.push('Duplicate split timestamps were removed.');
  }

  return {
    pointsMs: dedupedPoints,
    errors,
    warnings,
  };
}
