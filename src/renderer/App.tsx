import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import WaCallout from '@awesome.me/webawesome/dist/react/callout/index.js';
import { DropZone } from './components/DropZone';
import { ClipList } from './components/ClipList';
import { CodecMatrixPanel } from './components/CodecMatrixPanel';
import { StitchPanel } from './components/StitchPanel';
import type {
  Clip,
  ClipProbeResult,
  ClipScanResult,
  ClipThumbnailResult,
  JobDone,
  JobProgress,
  StitchModePreference,
} from '../shared/ipc-contract';
import { parseSplitPoints } from '../shared/split-points';
import {
  analyzeStitchSelection,
  resolveStitchPlan,
} from '../shared/stitch-analysis';

interface ActiveJob {
  id: string;
  progress: JobProgress | null;
  totalBytes: number;
}

function markClipsAsProbing(scanResult: ClipScanResult): ClipScanResult {
  return {
    ...scanResult,
    clips: scanResult.clips.map((clip) => ({
      ...clip,
      metadata: null,
      probeStatus: 'probing',
      probeError: null,
      thumbnailUrl: null,
      thumbnailStatus: 'generating',
      thumbnailError: null,
    })),
  };
}

function applyProbeResults(
  scanResult: ClipScanResult,
  probeResults: ClipProbeResult[],
): ClipScanResult {
  const probeByPath = new Map(probeResults.map((result) => [result.path, result]));

  return {
    ...scanResult,
    clips: scanResult.clips.map((clip) => {
      const result = probeByPath.get(clip.path);
      if (!result) {
        return clip;
      }

      return {
        ...clip,
        metadata: result.metadata,
        probeStatus: result.error ? 'error' : 'ready',
        probeError: result.error,
      };
    }),
  };
}

function applyThumbnailResults(
  scanResult: ClipScanResult,
  thumbnailResults: ClipThumbnailResult[],
): ClipScanResult {
  const thumbnailsByPath = new Map(
    thumbnailResults.map((result) => [result.path, result]),
  );

  return {
    ...scanResult,
    clips: scanResult.clips.map((clip) => {
      const result = thumbnailsByPath.get(clip.path);
      if (!result) {
        return clip;
      }

      return {
        ...clip,
        thumbnailUrl: result.thumbnailUrl,
        thumbnailStatus: result.error ? 'error' : 'ready',
        thumbnailError: result.error,
      };
    }),
  };
}

function markThumbnailFailure(
  scanResult: ClipScanResult,
  errorMessage: string,
): ClipScanResult {
  return {
    ...scanResult,
    clips: scanResult.clips.map((clip) => ({
      ...clip,
      thumbnailUrl: null,
      thumbnailStatus: 'error',
      thumbnailError: errorMessage,
    })),
  };
}

function markProbeFailure(
  scanResult: ClipScanResult,
  errorMessage: string,
): ClipScanResult {
  return {
    ...scanResult,
    clips: scanResult.clips.map((clip) => ({
      ...clip,
      metadata: null,
      probeStatus: 'error',
      probeError: errorMessage,
    })),
  };
}

function sumDurationsOrNull(clips: Clip[]): number | null {
  if (
    clips.length === 0 ||
    clips.some((clip) => clip.metadata?.durationMs == null)
  ) {
    return null;
  }

  return clips.reduce(
    (sum, clip) => sum + (clip.metadata?.durationMs ?? 0),
    0,
  );
}

function moveArrayItem<T>(items: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function reorderClipsWithinSession(
  scanResult: ClipScanResult,
  sessionId: string,
  activePath: string,
  overPath: string,
): ClipScanResult {
  const session = scanResult.sessions.find((item) => item.id === sessionId);
  if (!session) {
    return scanResult;
  }

  const activeIndex = session.clipPaths.indexOf(activePath);
  const overIndex = session.clipPaths.indexOf(overPath);
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
    return scanResult;
  }

  const reorderedClipPaths = moveArrayItem(
    session.clipPaths,
    activeIndex,
    overIndex,
  );
  const clipByPath = new Map(scanResult.clips.map((clip) => [clip.path, clip]));
  const reorderedSessionClips = reorderedClipPaths
    .map((clipPath) => clipByPath.get(clipPath))
    .filter((clip): clip is Clip => Boolean(clip));

  let sessionClipIndex = 0;

  return {
    clips: scanResult.clips.map((clip) => {
      if (clip.sessionId !== sessionId) {
        return clip;
      }

      const reorderedClip = reorderedSessionClips[sessionClipIndex];
      sessionClipIndex += 1;
      return reorderedClip ?? clip;
    }),
    sessions: scanResult.sessions.map((item) =>
      item.id === sessionId
        ? { ...item, clipPaths: reorderedClipPaths }
        : item,
    ),
  };
}

export function App() {
  const [folder, setFolder] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ClipScanResult>({
    clips: [],
    sessions: [],
  });
  const [selectedClipPaths, setSelectedClipPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [hasScannedCurrentFolder, setHasScannedCurrentFolder] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [stitchMode, setStitchMode] = useState<StitchModePreference>('auto');
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitTimestampsText, setSplitTimestampsText] = useState('');
  const [job, setJob] = useState<ActiveJob | null>(null);
  const [result, setResult] = useState<JobDone | null>(null);
  const scanTokenRef = useRef(0);

  const clips = scanResult.clips;
  const sessions = scanResult.sessions;

  useEffect(() => {
    const unsubProgress = window.api.onProgress((p) => {
      setJob((j) => (j && j.id === p.jobId ? { ...j, progress: p } : j));
    });
    const unsubDone = window.api.onJobDone((d) => {
      setResult(d);
      setJob(null);
    });
    return () => {
      unsubProgress();
      unsubDone();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void window.api.getPreferences().then((prefs) => {
      if (cancelled) {
        return;
      }
      setFolder(prefs.lastFolder);
      setOutput(prefs.lastOutputPath);
      setHasScannedCurrentFolder(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const totalBytes = clips.reduce((sum, c) => sum + c.size, 0);
  const selectedClips = clips.filter((clip) => selectedClipPaths.has(clip.path));
  const selectedBytes = selectedClips.reduce((sum, clip) => sum + clip.size, 0);
  const totalDurationMs = sumDurationsOrNull(clips);
  const selectedDurationMs = sumDurationsOrNull(selectedClips);
  const selectedProbePending = selectedClips.some(
    (clip) => clip.probeStatus === 'idle' || clip.probeStatus === 'probing',
  );
  const probingMetadata = clips.some(
    (clip) => clip.probeStatus === 'idle' || clip.probeStatus === 'probing',
  );
  const generatingThumbnails = clips.some(
    (clip) =>
      clip.thumbnailStatus === 'idle' ||
      clip.thumbnailStatus === 'generating',
  );
  const metadataErrorCount = clips.filter(
    (clip) => clip.probeStatus === 'error',
  ).length;
  const stitchAnalysis =
    selectedClips.length > 0 ? analyzeStitchSelection(selectedClips) : null;
  const stitchPlan = resolveStitchPlan(output, stitchMode, stitchAnalysis);
  const hasSplitInput = splitTimestampsText.trim() !== '';
  const parsedSplitPoints = parseSplitPoints(
    splitTimestampsText,
    selectedDurationMs,
  );
  const splitErrors =
    splitEnabled && parsedSplitPoints.pointsMs.length === 0
      ? splitTimestampsText.trim() === ''
        ? ['Add at least one split timestamp.']
        : parsedSplitPoints.errors
      : splitEnabled
        ? parsedSplitPoints.errors
        : [];
  const splitWarnings = splitEnabled && (hasSplitInput || parsedSplitPoints.pointsMs.length > 0)
    ? [
        'Split files are created after the main stitch and use fast stream copy, so cut points land on the nearest keyframe.',
        ...parsedSplitPoints.warnings,
      ]
    : [];

  const scanFolderPath = async (folderPath: string) => {
    const scanToken = scanTokenRef.current + 1;
    scanTokenRef.current = scanToken;

    setFolder(folderPath);
    setScanResult({ clips: [], sessions: [] });
    setSelectedClipPaths(new Set());
    setHasScannedCurrentFolder(false);
    setScanError(null);
    setScanning(true);
    setResult(null);
    try {
      const nextScanResult = await window.api.scanFolder(folderPath);
      if (scanTokenRef.current !== scanToken) {
        return;
      }

      setScanResult(markClipsAsProbing(nextScanResult));
      setSelectedClipPaths(
        new Set(nextScanResult.sessions[0]?.clipPaths ?? []),
      );
      setHasScannedCurrentFolder(true);

      if (nextScanResult.clips.length > 0) {
        void window.api
          .probeClips(nextScanResult.clips.map((clip) => clip.path))
          .then((probeResults) => {
            if (scanTokenRef.current !== scanToken) {
              return;
            }
            setScanResult((current) =>
              applyProbeResults(current, probeResults),
            );
          })
          .catch((error) => {
            if (scanTokenRef.current !== scanToken) {
              return;
            }
            setScanResult((current) =>
              markProbeFailure(current, String(error)),
            );
          });

        void window.api
          .generateThumbnails(
            nextScanResult.clips.map((clip) => ({
              path: clip.path,
              mtime: clip.mtime,
            })),
          )
          .then((thumbnailResults) => {
            if (scanTokenRef.current !== scanToken) {
              return;
            }
            setScanResult((current) =>
              applyThumbnailResults(current, thumbnailResults),
            );
          })
          .catch((error) => {
            if (scanTokenRef.current !== scanToken) {
              return;
            }
            setScanResult((current) =>
              markThumbnailFailure(current, String(error)),
            );
          });
      }
    } catch (e) {
      if (scanTokenRef.current === scanToken) {
        setScanError(String(e));
        setHasScannedCurrentFolder(false);
      }
    } finally {
      if (scanTokenRef.current === scanToken) {
        setScanning(false);
      }
    }
  };

  const handlePickFolder = async () => {
    const f = await window.api.pickFolder();
    if (!f) return;
    await scanFolderPath(f);
  };

  const handleScanSavedFolder = async () => {
    if (!folder) return;
    await scanFolderPath(folder);
  };

  const handlePickOutput = async () => {
    const leadClip = selectedClips[0] ?? clips[0];
    const suggestedStem =
      `${leadClip?.name.replace(/\.[^.]+$/u, '') ?? 'stitched'}-stitched`;
    const o = await window.api.pickOutputFile({
      suggestedStem,
      currentOutputPath: output,
    });
    if (o) setOutput(o);
  };

  const handleStitch = async () => {
    if (
      !output ||
      selectedClips.length === 0 ||
      selectedProbePending ||
      !stitchPlan.canStart ||
      !stitchPlan.resolvedMode ||
      splitErrors.length > 0
    ) {
      return;
    }
    setResult(null);
    const id = await window.api.startStitch({
      inputs: selectedClips.map((c) => c.path),
      output,
      splitPointsMs: splitEnabled ? parsedSplitPoints.pointsMs : [],
      mode: stitchPlan.resolvedMode,
      totalBytes: selectedBytes,
      expectedDurationMs: selectedDurationMs,
    });
    setJob({ id, progress: null, totalBytes: selectedBytes });
  };

  const handleCancel = async () => {
    if (job) await window.api.cancelStitch(job.id);
  };

  const handleOpenOutput = (filePath: string) => {
    window.api.openInExplorer(filePath);
  };

  const handleToggleClip = (clipPath: string, checked: boolean) => {
    setSelectedClipPaths((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(clipPath);
      } else {
        next.delete(clipPath);
      }
      return next;
    });
  };

  const handleToggleSession = (clipPaths: string[], checked: boolean) => {
    setSelectedClipPaths((current) => {
      const next = new Set(current);
      for (const clipPath of clipPaths) {
        if (checked) {
          next.add(clipPath);
        } else {
          next.delete(clipPath);
        }
      }
      return next;
    });
  };

  const handleReorderSession = (
    sessionId: string,
    activePath: string,
    overPath: string,
  ) => {
    setScanResult((current) =>
      reorderClipsWithinSession(current, sessionId, activePath, overPath),
    );
  };

  return (
    <main className="ks-app">
      <header className="ks-header">
        <h1>klip-stitcher</h1>
        <p className="ks-subtitle">
          Concatenate OBS auto-split MKV clips into one seamless file.
        </p>
      </header>

      <DropZone
        folder={folder}
        clipCount={clips.length}
        totalBytes={totalBytes}
        totalDurationMs={totalDurationMs}
        hasScannedCurrentFolder={hasScannedCurrentFolder}
        scanning={scanning}
        probingMetadata={probingMetadata}
        metadataErrorCount={metadataErrorCount}
        onScanFolder={handleScanSavedFolder}
        onPickFolder={handlePickFolder}
      />

      {scanError && (
        <WaCallout variant="danger" className="ks-card">
          <FontAwesomeIcon icon={faTriangleExclamation} slot="icon" />
          <strong>Scan failed:</strong> {scanError}
        </WaCallout>
      )}

      {clips.length > 0 && (
        <>
          <ClipList
            clips={clips}
            sessions={sessions}
            gapWarnings={stitchAnalysis?.gaps ?? []}
            selectedPaths={selectedClipPaths}
            selectedBytes={selectedBytes}
            selectedDurationMs={selectedDurationMs}
            probingMetadata={probingMetadata}
            generatingThumbnails={generatingThumbnails}
            onReorderSession={handleReorderSession}
            onToggleClip={handleToggleClip}
            onToggleSession={handleToggleSession}
          />
          <CodecMatrixPanel
            analysis={stitchAnalysis}
            selectedProbePending={selectedProbePending}
          />
          <StitchPanel
            output={output}
            clipCount={selectedClips.length}
            totalBytes={job?.totalBytes ?? selectedBytes}
            selectedDurationMs={selectedDurationMs}
            selectedProbePending={selectedProbePending}
            stitchMode={stitchMode}
            stitchPlan={stitchPlan}
            splitEnabled={splitEnabled}
            splitTimestampsText={splitTimestampsText}
            splitPointCount={parsedSplitPoints.pointsMs.length}
            splitErrors={splitErrors}
            splitWarnings={splitWarnings}
            running={!!job}
            progress={job?.progress ?? null}
            result={result}
            onPickOutput={handlePickOutput}
            onSetStitchMode={setStitchMode}
            onSetSplitEnabled={setSplitEnabled}
            onSetSplitTimestampsText={setSplitTimestampsText}
            onStitch={handleStitch}
            onCancel={handleCancel}
            onOpenOutput={handleOpenOutput}
          />
        </>
      )}
    </main>
  );
}
