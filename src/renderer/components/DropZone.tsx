import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolderOpen } from '@fortawesome/free-solid-svg-icons';
import WaButton from '@awesome.me/webawesome/dist/react/button/index.js';
import WaCard from '@awesome.me/webawesome/dist/react/card/index.js';
import WaSpinner from '@awesome.me/webawesome/dist/react/spinner/index.js';
import { formatBytes, formatDuration } from '../utils/format';

interface Props {
  folder: string | null;
  clipCount: number;
  totalBytes: number;
  totalDurationMs: number | null;
  hasScannedCurrentFolder: boolean;
  scanning: boolean;
  probingMetadata: boolean;
  metadataErrorCount: number;
  onScanFolder: () => void;
  onPickFolder: () => void;
}

export function DropZone({
  folder,
  clipCount,
  totalBytes,
  totalDurationMs,
  hasScannedCurrentFolder,
  scanning,
  probingMetadata,
  metadataErrorCount,
  onScanFolder,
  onPickFolder,
}: Props) {
  const needsScan = Boolean(folder) && !hasScannedCurrentFolder;

  return (
    <WaCard className="ks-card">
      <div slot="header">
        <h2>Source folder</h2>
      </div>

      {folder ? (
        <div className="ks-source ks-source-active">
          <FontAwesomeIcon icon={faFolderOpen} className="ks-source-icon" />
          <code className="ks-source-path">{folder}</code>
          <div className="ks-source-stats">
            {scanning ? (
              <span className="ks-scanning">
                <WaSpinner /> Scanning…
              </span>
            ) : needsScan ? (
              <span>Saved folder ready to scan.</span>
            ) : (
              <span>
                {clipCount.toLocaleString()} clip{clipCount === 1 ? '' : 's'}
                {' · '}
                {formatBytes(totalBytes)}
                {totalDurationMs != null && (
                  <>
                    {' · '}
                    {formatDuration(totalDurationMs)}
                  </>
                )}
                {totalDurationMs == null && probingMetadata && (
                  <>
                    {' · '}
                    probing metadata…
                  </>
                )}
                {totalDurationMs == null &&
                  !probingMetadata &&
                  metadataErrorCount > 0 && (
                    <>
                      {' · '}
                      duration unavailable for {metadataErrorCount} clip
                      {metadataErrorCount === 1 ? '' : 's'}
                    </>
                  )}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="ks-source ks-source-empty">
          <FontAwesomeIcon
            icon={faFolderOpen}
            className="ks-source-bigicon"
          />
          <p>Pick a folder containing OBS-recorded .mkv clips.</p>
        </div>
      )}

      <div slot="footer">
        <div className="ks-source-actions">
          {needsScan && (
            <WaButton
              variant="brand"
              appearance="accent"
              onClick={onScanFolder}
              disabled={scanning}
            >
              <FontAwesomeIcon icon={faFolderOpen} slot="start" />
              Scan saved folder
            </WaButton>
          )}
          <WaButton
            variant={needsScan ? 'neutral' : 'brand'}
            appearance={needsScan ? 'outlined' : 'accent'}
            onClick={onPickFolder}
            disabled={scanning}
          >
            <FontAwesomeIcon icon={faFolderOpen} slot="start" />
            {folder ? 'Choose different folder' : 'Choose folder'}
          </WaButton>
        </div>
      </div>
    </WaCard>
  );
}
