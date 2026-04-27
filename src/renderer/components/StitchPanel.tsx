import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCheck,
  faFolder,
  faPlay,
  faStop,
  faTriangleExclamation,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import WaButton from '@awesome.me/webawesome/dist/react/button/index.js';
import WaCallout from '@awesome.me/webawesome/dist/react/callout/index.js';
import WaCard from '@awesome.me/webawesome/dist/react/card/index.js';
import WaProgressBar from '@awesome.me/webawesome/dist/react/progress-bar/index.js';
import type { JobDone, JobProgress } from '../../shared/ipc-contract';
import { formatBytes, formatDuration } from '../utils/format';

interface Props {
  output: string | null;
  clipCount: number;
  totalBytes: number;
  running: boolean;
  progress: JobProgress | null;
  result: JobDone | null;
  onPickOutput: () => void;
  onStitch: () => void;
  onCancel: () => void;
  onOpenOutput: (path: string) => void;
}

export function StitchPanel(props: Props) {
  const {
    output,
    clipCount,
    totalBytes,
    running,
    progress,
    result,
    onPickOutput,
    onStitch,
    onCancel,
    onOpenOutput,
  } = props;

  const pct = progress ? Math.round(progress.fraction * 100) : 0;

  return (
    <WaCard className="ks-card">
      <div slot="header">
        <h2>Output</h2>
      </div>

      <div className="ks-output-row">
        <FontAwesomeIcon icon={faFolder} className="ks-output-icon" />
        <code className="ks-output-path">
          {output ?? <em>(no output file selected)</em>}
        </code>
        <WaButton
          size="small"
          variant="neutral"
          appearance="outlined"
          onClick={onPickOutput}
          disabled={running}
        >
          {output ? 'Change…' : 'Choose…'}
        </WaButton>
      </div>

      {running && (
        <div className="ks-progress-section">
          <WaProgressBar value={pct}>{pct}%</WaProgressBar>
          <div className="ks-progress-stats">
            {progress?.speed && <span>speed: {progress.speed}</span>}
            <span>
              {formatBytes(progress?.bytesWritten ?? 0)}
              {' / '}
              {formatBytes(totalBytes)}
            </span>
          </div>
        </div>
      )}

      {!running && result?.status === 'success' && (
        <WaCallout variant="success" className="ks-result">
          <FontAwesomeIcon icon={faCheck} slot="icon" />
          <div className="ks-result-body">
            <div>
              Done in {formatDuration(result.durationMs)} —{' '}
              <code>{result.output}</code>
            </div>
            <WaButton
              size="small"
              variant="neutral"
              appearance="outlined"
              onClick={() => onOpenOutput(result.output)}
            >
              Show in Explorer
            </WaButton>
          </div>
        </WaCallout>
      )}
      {!running && result?.status === 'error' && (
        <WaCallout variant="danger" className="ks-result">
          <FontAwesomeIcon icon={faTriangleExclamation} slot="icon" />
          <pre className="ks-error">{result.error}</pre>
        </WaCallout>
      )}
      {!running && result?.status === 'cancelled' && (
        <WaCallout variant="warning" className="ks-result">
          <FontAwesomeIcon icon={faXmark} slot="icon" />
          Stitch cancelled.
        </WaCallout>
      )}

      <div slot="footer">
        {!running ? (
          <WaButton
            variant="brand"
            appearance="accent"
            size="large"
            onClick={onStitch}
            disabled={!output || clipCount === 0}
          >
            <FontAwesomeIcon icon={faPlay} slot="start" />
            Stitch {clipCount} clip{clipCount === 1 ? '' : 's'}
          </WaButton>
        ) : (
          <WaButton
            variant="danger"
            appearance="accent"
            size="large"
            onClick={onCancel}
          >
            <FontAwesomeIcon icon={faStop} slot="start" />
            Cancel
          </WaButton>
        )}
      </div>
    </WaCard>
  );
}
