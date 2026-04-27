import WaCard from '@awesome.me/webawesome/dist/react/card/index.js';
import type {
  CompatibilityPropertySummary,
  StitchAnalysis,
} from '../../shared/ipc-contract';
import { formatCodecName } from '../utils/format';

interface Props {
  analysis: StitchAnalysis | null;
  selectedProbePending: boolean;
}

function formatPropertyValue(
  property: CompatibilityPropertySummary,
  value: string,
): string {
  return property.key === 'videoCodec' || property.key === 'audioCodec'
    ? formatCodecName(value)
    : value;
}

function describePropertyValues(property: CompatibilityPropertySummary): string {
  const parts = property.values.map(
    ({ value, count }) =>
      `${formatPropertyValue(property, value)} × ${count.toLocaleString()}`,
  );

  if (property.missingCount > 0) {
    parts.push(`${property.missingCount.toLocaleString()} missing`);
  }

  return parts.join(', ') || 'Unavailable';
}

function describeStatus(
  status: CompatibilityPropertySummary['status'],
): string {
  switch (status) {
    case 'match':
      return 'Match';
    case 'mismatch':
      return 'Mismatch';
    default:
      return 'Unknown';
  }
}

function describeCopyCompatibility(analysis: StitchAnalysis): string {
  switch (analysis.copyCompatibility) {
    case 'compatible':
      return 'Stream copy ready';
    case 'mismatch':
      return 'Stream copy mismatch';
    default:
      return 'Stream copy uncertain';
  }
}

function describeMp4Compatibility(analysis: StitchAnalysis): string {
  switch (analysis.mp4Compatibility) {
    case 'supported':
      return 'MP4 remux safe';
    case 'unsupported':
      return 'MP4 remux blocked';
    default:
      return 'MP4 remux uncertain';
  }
}

export function CodecMatrixPanel({ analysis, selectedProbePending }: Props) {
  if (!analysis) {
    return null;
  }

  return (
    <WaCard className="ks-card">
      <div slot="header" className="ks-card-header">
        <h2>Compatibility</h2>
        <span className="ks-probing-note">
          Analyzed {analysis.analyzedClipCount.toLocaleString()} of{' '}
          {analysis.selectedClipCount.toLocaleString()} selected clip
          {analysis.selectedClipCount === 1 ? '' : 's'}
          {selectedProbePending ? '…' : ''}
        </span>
      </div>

      <div className="ks-compatibility-summary">
        <span
          className={`ks-chip ks-compatibility-chip ks-compatibility-chip-${analysis.copyCompatibility}`}
        >
          {describeCopyCompatibility(analysis)}
        </span>
        <span
          className={`ks-chip ks-compatibility-chip ks-compatibility-chip-${analysis.mp4Compatibility}`}
        >
          {describeMp4Compatibility(analysis)}
        </span>
        {analysis.gaps.length > 0 && (
          <span className="ks-chip ks-chip-gap">
            {analysis.gaps.length} timeline gap
            {analysis.gaps.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="ks-matrix-wrap">
        <table className="ks-matrix-table">
          <thead>
            <tr>
              <th scope="col">Property</th>
              <th scope="col">Status</th>
              <th scope="col">Observed values</th>
            </tr>
          </thead>
          <tbody>
            {analysis.propertySummaries.map((property) => (
              <tr
                key={property.key}
                className={`ks-matrix-row ks-matrix-row-${property.status}`}
              >
                <th scope="row">{property.label}</th>
                <td>{describeStatus(property.status)}</td>
                <td>{describePropertyValues(property)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {analysis.mp4CompatibilityIssues.length > 0 && (
        <div slot="footer" className="ks-cliplist-footer">
          MP4 remux issues: {analysis.mp4CompatibilityIssues.join(' · ')}
        </div>
      )}
    </WaCard>
  );
}
