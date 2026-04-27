import fs from 'node:fs/promises';
import path from 'node:path';
import type { Clip } from '../../shared/ipc-contract';

// OBS produces two filename shapes within a single recording session:
//   first file:  "2026-03-06 19-42-13.mkv"  (space)
//   split files: "2026-03-06_19-42-43.mkv"  (underscore)
// Accept either separator; case-insensitive ".mkv".
const TS_RE = /^(\d{4})-(\d{2})-(\d{2})[ _](\d{2})-(\d{2})-(\d{2})\.mkv$/i;

function parseTimestampFromName(name: string): number | null {
  const m = TS_RE.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  // Local time interpretation matches what OBS writes (clock-wall time).
  const t = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
  ).getTime();
  return Number.isFinite(t) ? t : null;
}

export async function scanFolder(folder: string): Promise<Clip[]> {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  const candidates = entries.filter((e) => {
    if (!e.isFile()) return false;
    const lower = e.name.toLowerCase();
    // Skip OBS's interrupted-recording artefact.
    if (lower.endsWith('.mkv.part')) return false;
    return lower.endsWith('.mkv');
  });

  const clips = await Promise.all(
    candidates.map(async (e): Promise<Clip> => {
      const fullPath = path.join(folder, e.name);
      const stat = await fs.stat(fullPath);
      return {
        path: fullPath,
        name: e.name,
        timestamp: parseTimestampFromName(e.name),
        size: stat.size,
        mtime: stat.mtimeMs,
      };
    }),
  );

  // Sort: prefer parsed timestamp ascending; clips without a parseable name
  // sink to the end and fall back to mtime among themselves.
  clips.sort((a, b) => {
    if (a.timestamp != null && b.timestamp != null) {
      return a.timestamp - b.timestamp;
    }
    if (a.timestamp != null) return -1;
    if (b.timestamp != null) return 1;
    return a.mtime - b.mtime;
  });

  return clips;
}
