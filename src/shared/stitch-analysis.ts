import type {
  Clip,
  ClipMetadata,
  CompatibilityPropertyKey,
  CompatibilityPropertySummary,
  GapWarning,
  OutputFormat,
  ResolvedStitchMode,
  StitchAnalysis,
  StitchModePreference,
} from './ipc-contract';

const GAP_WARNING_THRESHOLD_MS = 2_000;
const MP4_VIDEO_CODECS = new Set(['h264', 'hevc']);
const MP4_AUDIO_CODECS = new Set(['aac']);

const PROPERTY_DEFINITIONS: Array<{
  key: CompatibilityPropertyKey;
  label: string;
  readValue: (metadata: ClipMetadata) => string | null;
}> = [
  {
    key: 'videoCodec',
    label: 'Video codec',
    readValue: (metadata) => metadata.videoCodec,
  },
  {
    key: 'width',
    label: 'Width',
    readValue: (metadata) =>
      metadata.width == null ? null : String(metadata.width),
  },
  {
    key: 'height',
    label: 'Height',
    readValue: (metadata) =>
      metadata.height == null ? null : String(metadata.height),
  },
  {
    key: 'pixelFormat',
    label: 'Pixel format',
    readValue: (metadata) => metadata.pixelFormat,
  },
  {
    key: 'frameRate',
    label: 'Frame rate',
    readValue: (metadata) => metadata.frameRate,
  },
  {
    key: 'audioCodec',
    label: 'Audio codec',
    readValue: (metadata) => metadata.audioCodec,
  },
  {
    key: 'sampleRate',
    label: 'Sample rate',
    readValue: (metadata) =>
      metadata.sampleRate == null ? null : String(metadata.sampleRate),
  },
  {
    key: 'channels',
    label: 'Channels',
    readValue: (metadata) =>
      metadata.channels == null ? null : String(metadata.channels),
  },
  {
    key: 'channelLayout',
    label: 'Channel layout',
    readValue: (metadata) => metadata.channelLayout,
  },
];

function normalizeCodec(codec: string | null | undefined): string | null {
  if (typeof codec !== 'string') {
    return null;
  }
  const trimmed = codec.trim().toLowerCase();
  return trimmed === '' ? null : trimmed;
}

function getOutputExtension(outputPath: string | null): string | null {
  if (!outputPath) {
    return null;
  }
  const match = /\.([^.]+)$/u.exec(outputPath.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

function collectPropertySummary(
  clips: Clip[],
  key: CompatibilityPropertyKey,
  label: string,
  readValue: (metadata: ClipMetadata) => string | null,
): CompatibilityPropertySummary {
  const valueCounts = new Map<string, number>();
  let missingCount = 0;

  for (const clip of clips) {
    if (!clip.metadata) {
      missingCount += 1;
      continue;
    }

    const value = readValue(clip.metadata);
    if (value == null || value === '') {
      missingCount += 1;
      continue;
    }

    valueCounts.set(value, (valueCounts.get(value) ?? 0) + 1);
  }

  const values = Array.from(valueCounts.entries()).map(([value, count]) => ({
    value,
    count,
  }));

  const status =
    values.length > 1
      ? 'mismatch'
      : missingCount > 0 || values.length === 0
        ? 'unknown'
        : 'match';

  return {
    key,
    label,
    status,
    values,
    missingCount,
  };
}

function countCodecOccurrences(
  clips: Clip[],
  readCodec: (metadata: ClipMetadata) => string | null | undefined,
  supportedCodecs: ReadonlySet<string>,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const clip of clips) {
    if (!clip.metadata) {
      continue;
    }

    const codec = normalizeCodec(readCodec(clip.metadata));
    if (!codec || supportedCodecs.has(codec)) {
      continue;
    }

    counts.set(codec, (counts.get(codec) ?? 0) + 1);
  }

  return counts;
}

function formatCodecIssues(
  counts: Map<string, number>,
  mediaLabel: string,
): string[] {
  return Array.from(counts.entries()).map(
    ([codec, count]) =>
      `${mediaLabel} codec ${codec.toUpperCase()} on ${count} clip${count === 1 ? '' : 's'}`,
  );
}

export function getOutputFormat(outputPath: string | null): OutputFormat | null {
  const ext = getOutputExtension(outputPath);
  if (ext === 'mkv' || ext === 'mp4') {
    return ext;
  }
  return null;
}

export function describeResolvedMode(mode: ResolvedStitchMode | null): string {
  switch (mode) {
    case 'copy-mkv':
      return 'Stream copy into MKV';
    case 'remux-mp4':
      return 'Stream copy remux into MP4';
    case 'reencode-mkv':
      return 'Re-encode into MKV';
    case 'reencode-mp4':
      return 'Re-encode into MP4';
    default:
      return 'No stitch mode selected';
  }
}

export function analyzeStitchSelection(clips: Clip[]): StitchAnalysis {
  const propertySummaries = PROPERTY_DEFINITIONS.map((property) =>
    collectPropertySummary(
      clips,
      property.key,
      property.label,
      property.readValue,
    ),
  );
  const mismatchedProperties = propertySummaries.filter(
    (property) => property.status === 'mismatch',
  );
  const missingMetadataCount = clips.filter((clip) => !clip.metadata).length;
  const analyzedClipCount = clips.length - missingMetadataCount;

  const copyCompatibility =
    mismatchedProperties.length > 0
      ? 'mismatch'
      : missingMetadataCount > 0
        ? 'unknown'
        : 'compatible';

  const unsupportedVideoCodecs = countCodecOccurrences(
    clips,
    (metadata) => metadata.videoCodec,
    MP4_VIDEO_CODECS,
  );
  const unsupportedAudioCodecs = countCodecOccurrences(
    clips,
    (metadata) => metadata.audioCodec,
    MP4_AUDIO_CODECS,
  );
  const mp4CompatibilityIssues = [
    ...formatCodecIssues(unsupportedVideoCodecs, 'Video'),
    ...formatCodecIssues(unsupportedAudioCodecs, 'Audio'),
  ];
  const mp4Compatibility =
    mp4CompatibilityIssues.length > 0
      ? 'unsupported'
      : missingMetadataCount > 0
        ? 'unknown'
        : 'supported';

  const gaps: GapWarning[] = [];
  for (let index = 1; index < clips.length; index += 1) {
    const previousClip = clips[index - 1];
    const clip = clips[index];
    if (
      previousClip.timestamp == null ||
      clip.timestamp == null ||
      previousClip.metadata?.durationMs == null
    ) {
      continue;
    }

    const expectedStart = previousClip.timestamp + previousClip.metadata.durationMs;
    const gapMs = clip.timestamp - expectedStart;
    if (gapMs > GAP_WARNING_THRESHOLD_MS) {
      gaps.push({
        previousPath: previousClip.path,
        path: clip.path,
        gapMs,
      });
    }
  }

  return {
    selectedClipCount: clips.length,
    analyzedClipCount,
    missingMetadataCount,
    copyCompatibility,
    mp4Compatibility,
    mp4CompatibilityIssues,
    propertySummaries,
    gaps,
  };
}

export interface StitchPlan {
  outputFormat: OutputFormat | null;
  resolvedMode: ResolvedStitchMode | null;
  canStart: boolean;
  summary: string | null;
  warnings: string[];
  errors: string[];
}

export function resolveStitchPlan(
  outputPath: string | null,
  preference: StitchModePreference,
  analysis: StitchAnalysis | null,
): StitchPlan {
  const outputFormat = getOutputFormat(outputPath);
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!outputFormat) {
    errors.push('Choose an output path ending in .mkv or .mp4.');
  }
  if (!analysis || analysis.selectedClipCount === 0) {
    errors.push('Select at least one clip to stitch.');
  }

  if (analysis) {
    if (analysis.gaps.length > 0) {
      warnings.push(
        `${analysis.gaps.length} clip gap${analysis.gaps.length === 1 ? '' : 's'} detected in the selected timeline.`,
      );
    }
    if (analysis.copyCompatibility === 'mismatch') {
      warnings.push(
        'Selected clips do not share identical stream properties across the full selection.',
      );
    } else if (analysis.copyCompatibility === 'unknown') {
      warnings.push(
        'Some selected clips could not be fully analyzed, so fast-path compatibility is not guaranteed.',
      );
    }
  }

  if (errors.length > 0 || !analysis || !outputFormat) {
    return {
      outputFormat,
      resolvedMode: null,
      canStart: false,
      summary: null,
      warnings,
      errors,
    };
  }

  let resolvedMode: ResolvedStitchMode | null = null;

  if (preference === 'reencode') {
    resolvedMode = outputFormat === 'mp4' ? 'reencode-mp4' : 'reencode-mkv';
  } else if (preference === 'stream-copy') {
    if (
      outputFormat === 'mp4' &&
      analysis.mp4Compatibility === 'unsupported'
    ) {
      errors.push(
        'MP4 stream copy is not safe for the selected codecs. Switch to re-encode or save as MKV.',
      );
    } else {
      resolvedMode = outputFormat === 'mp4' ? 'remux-mp4' : 'copy-mkv';
    }
  } else if (outputFormat === 'mp4') {
    resolvedMode =
      analysis.copyCompatibility === 'compatible' &&
      analysis.mp4Compatibility === 'supported'
        ? 'remux-mp4'
        : 'reencode-mp4';
  } else {
    resolvedMode =
      analysis.copyCompatibility === 'compatible' ? 'copy-mkv' : 'reencode-mkv';
  }

  if (
    preference === 'auto' &&
    resolvedMode?.startsWith('reencode') &&
    analysis.copyCompatibility === 'mismatch'
  ) {
    warnings.push(
      'Auto mode switched to re-encode because the selected clips do not all match.',
    );
  } else if (
    preference === 'auto' &&
    resolvedMode?.startsWith('reencode') &&
    analysis.copyCompatibility === 'unknown'
  ) {
    warnings.push(
      'Auto mode switched to re-encode because compatibility could not be fully verified.',
    );
  }

  if (
    outputFormat === 'mp4' &&
    analysis.mp4Compatibility === 'unsupported'
  ) {
    warnings.push(
      ...analysis.mp4CompatibilityIssues.map(
        (issue) => `${issue} is not safe to remux directly into MP4.`,
      ),
    );
  }

  return {
    outputFormat,
    resolvedMode,
    canStart: errors.length === 0 && resolvedMode != null,
    summary: resolvedMode ? describeResolvedMode(resolvedMode) : null,
    warnings,
    errors,
  };
}
