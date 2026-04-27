import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilm, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import WaCard from '@awesome.me/webawesome/dist/react/card/index.js';
import type { Clip } from '../../shared/ipc-contract';
import { formatBytes } from '../utils/format';

interface Props {
  clips: Clip[];
}

export function ClipList({ clips }: Props) {
  const unparsed = clips.filter((c) => c.timestamp == null).length;
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
        {clips.map((c, i) => (
          <li key={c.path} className="ks-cliprow">
            <span className="ks-cliprow-num">{i + 1}</span>
            <FontAwesomeIcon icon={faFilm} className="ks-cliprow-icon" />
            <span className="ks-cliprow-name" title={c.path}>
              {c.name}
            </span>
            <span className="ks-cliprow-size">{formatBytes(c.size)}</span>
          </li>
        ))}
      </ol>
    </WaCard>
  );
}
