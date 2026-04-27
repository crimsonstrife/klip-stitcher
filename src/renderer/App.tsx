import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import WaCallout from '@awesome.me/webawesome/dist/react/callout/index.js';
import { DropZone } from './components/DropZone';
import { ClipList } from './components/ClipList';
import { StitchPanel } from './components/StitchPanel';
import type {
  Clip,
  JobDone,
  JobProgress,
} from '../shared/ipc-contract';

interface ActiveJob {
  id: string;
  progress: JobProgress | null;
}

export function App() {
  const [folder, setFolder] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [job, setJob] = useState<ActiveJob | null>(null);
  const [result, setResult] = useState<JobDone | null>(null);

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

  const handlePickFolder = async () => {
    const f = await window.api.pickFolder();
    if (!f) return;
    setFolder(f);
    setClips([]);
    setScanError(null);
    setScanning(true);
    setResult(null);
    try {
      const cs = await window.api.scanFolder(f);
      setClips(cs);
    } catch (e) {
      setScanError(String(e));
    } finally {
      setScanning(false);
    }
  };

  const handlePickOutput = async () => {
    const first = clips[0]?.name?.replace(/\.mkv$/i, '') ?? 'stitched';
    const o = await window.api.pickOutputFile(`${first}-stitched.mkv`);
    if (o) setOutput(o);
  };

  const handleStitch = async () => {
    if (!output || clips.length === 0) return;
    setResult(null);
    const id = await window.api.startStitch({
      inputs: clips.map((c) => c.path),
      output,
      totalBytes,
    });
    setJob({ id, progress: null });
  };

  const handleCancel = async () => {
    if (job) await window.api.cancelStitch(job.id);
  };

  const handleOpenOutput = (filePath: string) => {
    window.api.openInExplorer(filePath);
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
          <ClipList clips={clips} />
          <StitchPanel
            output={output}
            clipCount={clips.length}
            totalBytes={totalBytes}
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
