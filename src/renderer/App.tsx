import { useEffect, useState } from 'react';
import type { FfmpegPaths } from '../shared/ipc-contract';

export function App() {
  const [paths, setPaths] = useState<FfmpegPaths | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.api
      .getFfmpegPaths()
      .then(setPaths)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main>
      <h1>klip-stitcher</h1>
      <p>Milestone 0 — scaffold check.</p>
      {error && (
        <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{error}</pre>
      )}
      {paths ? (
        <ul>
          <li>
            <strong>ffmpeg:</strong> <code>{paths.ffmpeg}</code>
          </li>
          <li>
            <strong>ffprobe:</strong> <code>{paths.ffprobe}</code>
          </li>
        </ul>
      ) : (
        !error && <p>Resolving binaries…</p>
      )}
    </main>
  );
}
