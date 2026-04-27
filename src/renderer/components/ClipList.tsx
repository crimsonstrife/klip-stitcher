import { Fragment } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilm, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import WaButton from '@awesome.me/webawesome/dist/react/button/index.js';
import WaCard from '@awesome.me/webawesome/dist/react/card/index.js';
import WaCheckbox from '@awesome.me/webawesome/dist/react/checkbox/index.js';
import type { Clip, ClipSession } from '../../shared/ipc-contract';
import { formatBytes, formatDateTime } from '../utils/format';

interface Props {
  clips: Clip[];
  sessions: ClipSession[];
  selectedPaths: ReadonlySet<string>;
  selectedBytes: number;
  onToggleClip: (clipPath: string, checked: boolean) => void;
  onToggleSession: (clipPaths: string[], checked: boolean) => void;
}

export function ClipList({
  clips,
  sessions,
  selectedPaths,
  selectedBytes,
  onToggleClip,
  onToggleSession,
}: Props) {
  const unparsed = clips.filter((c) => c.timestamp == null).length;
  const selectedCount = clips.filter((clip) => selectedPaths.has(clip.path)).length;
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
                    <FontAwesomeIcon
                      icon={faFilm}
                      className="ks-cliprow-icon"
                    />
                    <span className="ks-cliprow-name" title={clip.path}>
                      {clip.name}
                    </span>
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
      </div>
    </WaCard>
  );
}
