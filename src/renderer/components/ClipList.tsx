import { Fragment } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilm, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import WaButton from '@awesome.me/webawesome/dist/react/button/index.js';
import WaCard from '@awesome.me/webawesome/dist/react/card/index.js';
import WaCheckbox from '@awesome.me/webawesome/dist/react/checkbox/index.js';
import type { Clip, ClipSession } from '../../shared/ipc-contract';
import {
  formatBytes,
  formatClipDuration,
  formatCodecName,
  formatDateTime,
  formatDuration,
} from '../utils/format';

interface Props {
  clips: Clip[];
  sessions: ClipSession[];
  selectedPaths: ReadonlySet<string>;
  selectedBytes: number;
  selectedDurationMs: number | null;
  probingMetadata: boolean;
  generatingThumbnails: boolean;
  onToggleClip: (clipPath: string, checked: boolean) => void;
  onToggleSession: (clipPaths: string[], checked: boolean) => void;
}

export function ClipList({
  clips,
  sessions,
  selectedPaths,
  selectedBytes,
  selectedDurationMs,
  probingMetadata,
  generatingThumbnails,
  onToggleClip,
  onToggleSession,
}: Props) {
  const unparsed = clips.filter((c) => c.timestamp == null).length;
  const probeErrors = clips.filter((clip) => clip.probeStatus === 'error').length;
  const selectedClips = clips.filter((clip) => selectedPaths.has(clip.path));
  const selectedCount = selectedClips.length;
  const selectedProbeErrors = selectedClips.filter(
    (clip) => clip.probeStatus === 'error',
  ).length;
  const clipByPath = new Map(clips.map((clip) => [clip.path, clip]));
  const clipIndexByPath = new Map(
    clips.map((clip, index) => [clip.path, index]),
  );

  return (
    <WaCard className="ks-card ks-cliplist-card">
      <div slot="header">
        <div className="ks-card-header">
          <h2>Clips ({clips.length})</h2>
          {unparsed > 0 && (
            <span className="ks-unparsed-warning">
              <FontAwesomeIcon icon={faTriangleExclamation} /> {unparsed}{' '}
              clip{unparsed === 1 ? '' : 's'} sorted by mtime (filename did
              not match the OBS timestamp pattern)
            </span>
          )}
          {probingMetadata && (
            <span className="ks-probing-note">Probing clip metadata…</span>
          )}
          {generatingThumbnails && (
            <span className="ks-probing-note">Generating thumbnails…</span>
          )}
          {!probingMetadata && probeErrors > 0 && (
            <span className="ks-unparsed-warning">
              <FontAwesomeIcon icon={faTriangleExclamation} /> metadata
              unavailable for {probeErrors} clip{probeErrors === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>
      <ol className="ks-cliplist">
        {sessions.map((session, sessionIndex) => {
          const sessionSelectedCount = session.clipPaths.filter((clipPath) =>
            selectedPaths.has(clipPath),
          ).length;
          const allSelected =
            session.clipCount > 0 &&
            sessionSelectedCount === session.clipCount;

          return (
            <Fragment key={session.id}>
              <li className="ks-session-row">
                <div className="ks-session-meta">
                  <strong>Session {sessionIndex + 1}</strong>
                  <span>
                    {session.clipCount.toLocaleString()} clip
                    {session.clipCount === 1 ? '' : 's'}
                    {' · '}
                    started {formatDateTime(session.startedAt)}
                    {' · '}
                    {sessionSelectedCount.toLocaleString()} selected
                  </span>
                </div>
                <WaButton
                  size="small"
                  variant="neutral"
                  appearance="outlined"
                  onClick={() =>
                    onToggleSession(session.clipPaths, !allSelected)
                  }
                >
                  {allSelected ? 'Deselect all' : 'Select all'}
                </WaButton>
              </li>

              {session.clipPaths.map((clipPath) => {
                const clip = clipByPath.get(clipPath);
                const clipIndex = clipIndexByPath.get(clipPath);

                if (!clip || clipIndex == null) {
                  return null;
                }

                const checked = selectedPaths.has(clip.path);

                return (
                  <li
                    key={clip.path}
                    className={`ks-cliprow${checked ? '' : ' ks-cliprow-excluded'}`}
                  >
                    <span className="ks-cliprow-num">{clipIndex + 1}</span>
                    <span className="ks-cliprow-check">
                      <WaCheckbox
                        checked={checked}
                        aria-label={`Include ${clip.name}`}
                        onChange={(event) => {
                          const target = event.currentTarget as EventTarget & {
                            checked: boolean;
                          };
                          onToggleClip(clip.path, target.checked);
                        }}
                      />
                    </span>
                    <span
                      className={`ks-cliprow-thumb ks-cliprow-thumb-${clip.thumbnailStatus}`}
                      title={clip.thumbnailError ?? undefined}
                    >
                      {clip.thumbnailUrl ? (
                        <img
                          src={clip.thumbnailUrl}
                          alt=""
                          className="ks-cliprow-thumb-image"
                        />
                      ) : (
                        <FontAwesomeIcon
                          icon={faFilm}
                          className="ks-cliprow-icon"
                        />
                      )}
                    </span>
                    <span className="ks-cliprow-name" title={clip.path}>
                      {clip.name}
                    </span>
                    <div className="ks-cliprow-metadata">
                      {clip.metadata?.durationMs != null && (
                        <span className="ks-chip ks-chip-duration">
                          {formatClipDuration(clip.metadata.durationMs)}
                        </span>
                      )}
                      {clip.metadata?.videoCodec && (
                        <span className="ks-chip ks-chip-codec">
                          {formatCodecName(clip.metadata.videoCodec)}
                        </span>
                      )}
                      {clip.metadata?.audioCodec && (
                        <span className="ks-chip ks-chip-codec">
                          {formatCodecName(clip.metadata.audioCodec)}
                        </span>
                      )}
                      {clip.probeStatus === 'probing' && (
                        <span className="ks-chip ks-chip-pending">
                          Analyzing…
                        </span>
                      )}
                      {clip.probeStatus === 'error' && (
                        <span
                          className="ks-chip ks-chip-error"
                          title={clip.probeError ?? undefined}
                        >
                          Probe failed
                        </span>
                      )}
                    </div>
                    <span className="ks-cliprow-size">
                      {formatBytes(clip.size)}
                    </span>
                  </li>
                );
              })}
            </Fragment>
          );
        })}
      </ol>
      <div slot="footer" className="ks-cliplist-footer">
        Selected: {selectedCount.toLocaleString()} of{' '}
        {clips.length.toLocaleString()} clip{clips.length === 1 ? '' : 's'}
        {' · '}
        {formatBytes(selectedBytes)}
        {selectedDurationMs != null && (
          <>
            {' · '}
            {formatDuration(selectedDurationMs)}
          </>
        )}
        {selectedDurationMs == null && selectedCount > 0 && probingMetadata && (
          <>
            {' · '}
            probing duration…
          </>
        )}
        {selectedDurationMs == null &&
          selectedCount > 0 &&
          !probingMetadata &&
          selectedProbeErrors > 0 && (
            <>
              {' · '}
              duration unavailable for {selectedProbeErrors} selected clip
              {selectedProbeErrors === 1 ? '' : 's'}
            </>
          )}
      </div>
    </WaCard>
  );
}
