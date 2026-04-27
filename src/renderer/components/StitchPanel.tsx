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
  PostStitchMode,
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
  postStitchEnabled: boolean;
  postStitchMode: PostStitchMode;
  splitTimestampsText: string;
  chapterMarkersText: string;
  chapterPreRollSeconds: string;
  chapterPostRollSeconds: string;
  postStitchOutputCount: number;
  postStitchErrors: string[];
  postStitchWarnings: string[];
  running: boolean;
  progress: JobProgress | null;
  result: JobDone | null;
  onPickOutput: () => void;
  onSetStitchMode: (mode: StitchModePreference) => void;
  onSetPostStitchEnabled: (enabled: boolean) => void;
  onSetPostStitchMode: (mode: PostStitchMode) => void;
  onSetSplitTimestampsText: (value: string) => void;
  onSetChapterMarkersText: (value: string) => void;
  onSetChapterPreRollSeconds: (value: string) => void;
  onSetChapterPostRollSeconds: (value: string) => void;
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
    postStitchEnabled,
    postStitchMode,
    splitTimestampsText,
    chapterMarkersText,
    chapterPreRollSeconds,
    chapterPostRollSeconds,
    postStitchOutputCount,
    postStitchErrors,
    postStitchWarnings,
    running,
    progress,
    result,
    onPickOutput,
    onSetStitchMode,
    onSetPostStitchEnabled,
    onSetPostStitchMode,
    onSetSplitTimestampsText,
    onSetChapterMarkersText,
    onSetChapterPreRollSeconds,
    onSetChapterPostRollSeconds,
    onStitch,
    onCancel,
    onOpenOutput,
  } = props;

  const pct = progress ? Math.round(progress.fraction * 100) : 0;
  const stitchDisabled =
    !output ||
    clipCount === 0 ||
    selectedProbePending ||
    !stitchPlan.canStart ||
    postStitchErrors.length > 0;

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

      <div className="ks-output-plan">
        <div className="ks-output-plan-header">
          <strong>Post-stitch exports</strong>
          {postStitchEnabled && postStitchOutputCount > 0 && (
            <span className="ks-probing-note">
              {postStitchOutputCount} file
              {postStitchOutputCount === 1 ? '' : 's'} planned
            </span>
          )}
        </div>
        <label className="ks-mode-option">
          <input
            type="checkbox"
            checked={postStitchEnabled}
            disabled={running}
            onChange={(event) =>
              onSetPostStitchEnabled(event.currentTarget.checked)
            }
          />
          <span className="ks-mode-option-body">
            <strong>Create extra files after stitching</strong>
            <span>
              Either split the stitched file at exact marker times or import VOD
              markers as padded chapter exports.
            </span>
          </span>
        </label>
        {postStitchEnabled && (
          <div className="ks-split-editor">
            <div className="ks-mode-options">
              <label className="ks-mode-option">
                <input
                  type="radio"
                  name="post-stitch-mode"
                  checked={postStitchMode === 'split-points'}
                  disabled={running}
                  onChange={() => onSetPostStitchMode('split-points')}
                />
                <span className="ks-mode-option-body">
                  <strong>Split at timestamps</strong>
                  <span>
                    Create contiguous numbered parts using plain recording
                    timestamps.
                  </span>
                </span>
              </label>
              <label className="ks-mode-option">
                <input
                  type="radio"
                  name="post-stitch-mode"
                  checked={postStitchMode === 'chapter-exports'}
                  disabled={running}
                  onChange={() => onSetPostStitchMode('chapter-exports')}
                />
                <span className="ks-mode-option-body">
                  <strong>VOD chapter CSV</strong>
                  <span>
                    Align the first VOD marker to recording start, then export
                    padded chapter files.
                  </span>
                </span>
              </label>
            </div>
            {postStitchMode === 'split-points' ? (
              <>
                <textarea
                  className="ks-split-textarea"
                  value={splitTimestampsText}
                  disabled={running}
                  placeholder={'00:15:32\n01:02:10\n1:45:00.500'}
                  onChange={(event) =>
                    onSetSplitTimestampsText(event.currentTarget.value)
                  }
                />
                <div className="ks-probing-note">
                  One timestamp per line, or separate with commas. Accepted
                  formats: <code>HH:MM:SS</code>, <code>MM:SS</code>,{' '}
                  <code>SS</code>, with optional decimals.
                </div>
              </>
            ) : (
              <>
                <textarea
                  className="ks-split-textarea"
                  value={chapterMarkersText}
                  disabled={running}
                  placeholder={
                    '0:25:12\tBroadcaster\tCrimsonStrife\n1:02:33\tBroadcaster\tCrimsonStrife'
                  }
                  onChange={(event) =>
                    onSetChapterMarkersText(event.currentTarget.value)
                  }
                />
                <div className="ks-padding-grid">
                  <label className="ks-padding-field">
                    <span>Pre-roll seconds</span>
                    <input
                      className="ks-padding-input"
                      type="text"
                      value={chapterPreRollSeconds}
                      disabled={running}
                      onChange={(event) =>
                        onSetChapterPreRollSeconds(event.currentTarget.value)
                      }
                    />
                  </label>
                  <label className="ks-padding-field">
                    <span>Post-roll seconds</span>
                    <input
                      className="ks-padding-input"
                      type="text"
                      value={chapterPostRollSeconds}
                      disabled={running}
                      onChange={(event) =>
                        onSetChapterPostRollSeconds(event.currentTarget.value)
                      }
                    />
                  </label>
                </div>
                <div className="ks-probing-note">
                  Paste the exported VOD marker rows here. The first marker must
                  represent recording start. If you do not have that marker, add
                  a <code>0:00:00</code> row before pasting.
                </div>
              </>
            )}
          </div>
        )}
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

      {!running &&
        !selectedProbePending &&
        postStitchEnabled &&
        postStitchErrors.length > 0 && (
        <WaCallout variant="danger" className="ks-result">
          <FontAwesomeIcon icon={faTriangleExclamation} slot="icon" />
          <div className="ks-plan-lines">
            {postStitchErrors.map((message) => (
              <div key={message}>{message}</div>
            ))}
          </div>
        </WaCallout>
      )}

      {!running &&
        !selectedProbePending &&
        postStitchEnabled &&
        postStitchWarnings.length > 0 && (
        <WaCallout variant="warning" className="ks-result">
          <FontAwesomeIcon icon={faTriangleExclamation} slot="icon" />
          <div className="ks-plan-lines">
            {postStitchWarnings.map((message) => (
              <div key={message}>{message}</div>
            ))}
          </div>
        </WaCallout>
      )}

      {running && (
        <div className="ks-progress-section">
          <WaProgressBar value={pct}>{pct}%</WaProgressBar>
          <div className="ks-progress-stats">
            {progress?.stageLabel && <span>{progress.stageLabel}</span>}
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
              {result.extraOutputs.length > 0 && (
                <>
                  {' · '}
                  {result.extraOutputs.length}{' '}
                  {result.extraOutputLabel ?? 'additional file'}
                  {result.extraOutputs.length === 1 ? '' : 's'}
                </>
              )}
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
          <div className="ks-error-panel">
            <div className="ks-error-title">{result.error.title}</div>
            <div>{result.error.message}</div>
            {result.error.suggestions.length > 0 && (
              <div className="ks-plan-lines ks-error-help">
                {result.error.suggestions.map((suggestion) => (
                  <div key={suggestion}>{suggestion}</div>
                ))}
              </div>
            )}
            {result.error.technicalDetails && (
              <details className="ks-error-details">
                <summary>Technical details</summary>
                <pre className="ks-error">{result.error.technicalDetails}</pre>
              </details>
            )}
          </div>
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
