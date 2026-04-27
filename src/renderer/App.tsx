import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import WaCallout from '@awesome.me/webawesome/dist/react/callout/index.js';
import { DropZone } from './components/DropZone';
import { ClipList } from './components/ClipList';
import { StitchPanel } from './components/StitchPanel';
import type {
  ClipScanResult,
  JobDone,
  JobProgress,
} from '../shared/ipc-contract';

interface ActiveJob {
  id: string;
  progress: JobProgress | null;
  totalBytes: number;
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
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [job, setJob] = useState<ActiveJob | null>(null);
  const [result, setResult] = useState<JobDone | null>(null);

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

  const totalBytes = clips.reduce((sum, c) => sum + c.size, 0);
  const selectedClips = clips.filter((clip) => selectedClipPaths.has(clip.path));
  const selectedBytes = selectedClips.reduce((sum, clip) => sum + clip.size, 0);

  const handlePickFolder = async () => {
    const f = await window.api.pickFolder();
    if (!f) return;
    setFolder(f);
    setScanResult({ clips: [], sessions: [] });
    setSelectedClipPaths(new Set());
    setScanError(null);
    setScanning(true);
    setResult(null);
    try {
      const nextScanResult = await window.api.scanFolder(f);
      setScanResult(nextScanResult);
      setSelectedClipPaths(
        new Set(nextScanResult.sessions[0]?.clipPaths ?? []),
      );
    } catch (e) {
      setScanError(String(e));
    } finally {
      setScanning(false);
    }
  };

  const handlePickOutput = async () => {
    const leadClip = selectedClips[0] ?? clips[0];
    const first = leadClip?.name.replace(/\.[^.]+$/u, '') ?? 'stitched';
    const o = await window.api.pickOutputFile(`${first}-stitched.mkv`);
    if (o) setOutput(o);
  };

  const handleStitch = async () => {
    if (!output || selectedClips.length === 0) return;
    setResult(null);
    const id = await window.api.startStitch({
      inputs: selectedClips.map((c) => c.path),
      output,
      totalBytes: selectedBytes,
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
        scanning={scanning}
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
            selectedPaths={selectedClipPaths}
            selectedBytes={selectedBytes}
            onToggleClip={handleToggleClip}
            onToggleSession={handleToggleSession}
          />
          <StitchPanel
            output={output}
            clipCount={selectedClips.length}
            totalBytes={job?.totalBytes ?? selectedBytes}
            running={!!job}
            progress={job?.progress ?? null}
            result={result}
            onPickOutput={handlePickOutput}
            onStitch={handleStitch}
            onCancel={handleCancel}
            onOpenOutput={handleOpenOutput}
          />
        </>
      )}
    </main>
  );
}
