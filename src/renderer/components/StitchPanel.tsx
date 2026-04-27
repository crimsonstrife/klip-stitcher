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
import type {
  JobDone,
  JobProgress,
  StitchModePreference,
} from '../../shared/ipc-contract';
import type { StitchPlan } from '../../shared/stitch-analysis';
import { formatBytes, formatDuration } from '../utils/format';

interface Props {
  output: string | null;
  clipCount: number;
  totalBytes: number;
  selectedDurationMs: number | null;
  selectedProbePending: boolean;
  stitchMode: StitchModePreference;
  stitchPlan: StitchPlan;
  running: boolean;
  progress: JobProgress | null;
  result: JobDone | null;
  onPickOutput: () => void;
  onSetStitchMode: (mode: StitchModePreference) => void;
  onStitch: () => void;
  onCancel: () => void;
  onOpenOutput: (path: string) => void;
}

interface ModeOption {
  value: StitchModePreference;
  label: string;
  description: string;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    value: 'auto',
    label: 'Auto',
    description: 'Use the fastest safe path for the current selection.',
  },
  {
    value: 'stream-copy',
    label: 'Fast copy/remux',
    description: 'Skip re-encoding and trust the selected clips to match.',
  },
  {
    value: 'reencode',
    label: 'Re-encode',
    description: 'Normalize the timeline for maximum compatibility.',
  },
];

export function StitchPanel(props: Props) {
  const {
    output,
    clipCount,
    totalBytes,
    selectedDurationMs,
    selectedProbePending,
    stitchMode,
    stitchPlan,
    running,
    progress,
    result,
    onPickOutput,
    onSetStitchMode,
    onStitch,
    onCancel,
    onOpenOutput,
  } = props;

  const pct = progress ? Math.round(progress.fraction * 100) : 0;
  const stitchDisabled =
    !output || clipCount === 0 || selectedProbePending || !stitchPlan.canStart;

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

      <div className="ks-output-plan">
        <div className="ks-output-plan-header">
          <strong>Mode</strong>
          {stitchPlan.summary && (
            <span className="ks-probing-note">{stitchPlan.summary}</span>
          )}
        </div>
        <div className="ks-mode-options">
          {MODE_OPTIONS.map((option) => (
            <label key={option.value} className="ks-mode-option">
              <input
                type="radio"
                name="stitch-mode"
                value={option.value}
                checked={stitchMode === option.value}
                disabled={running}
                onChange={() => onSetStitchMode(option.value)}
              />
              <span className="ks-mode-option-body">
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="ks-output-stats">
        <span>
          {clipCount.toLocaleString()} clip{clipCount === 1 ? '' : 's'}
        </span>
        <span>{formatBytes(totalBytes)}</span>
        {selectedDurationMs != null && <span>{formatDuration(selectedDurationMs)}</span>}
      </div>

      {!running && selectedProbePending && (
        <WaCallout variant="warning" className="ks-result">
          <FontAwesomeIcon icon={faTriangleExclamation} slot="icon" />
          Analyzing selected clips before stitching so copy/remux safety checks
          and gap warnings are accurate.
        </WaCallout>
      )}

      {!running && !selectedProbePending && stitchPlan.errors.length > 0 && (
        <WaCallout variant="danger" className="ks-result">
          <FontAwesomeIcon icon={faTriangleExclamation} slot="icon" />
          <div className="ks-plan-lines">
            {stitchPlan.errors.map((message) => (
              <div key={message}>{message}</div>
            ))}
          </div>
        </WaCallout>
      )}

      {!running && !selectedProbePending && stitchPlan.warnings.length > 0 && (
        <WaCallout variant="warning" className="ks-result">
          <FontAwesomeIcon icon={faTriangleExclamation} slot="icon" />
          <div className="ks-plan-lines">
            {stitchPlan.warnings.map((message) => (
              <div key={message}>{message}</div>
            ))}
          </div>
        </WaCallout>
      )}

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
            {progress?.outTimeMs != null && progress.outTimeMs > 0 && (
              <span>{formatDuration(progress.outTimeMs)}</span>
            )}
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
            disabled={stitchDisabled}
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
