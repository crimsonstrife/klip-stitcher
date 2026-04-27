import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  Clip,
  ClipScanResult,
  ClipSession,
} from '../../shared/ipc-contract';

// OBS produces two filename shapes within a single recording session:
//   first file:  "2026-03-06 19-42-13.mkv"  (space)
//   split files: "2026-03-06_19-42-43.mkv"  (underscore)
// Accept either separator; case-insensitive ".mkv".
const TS_RE = /^(\d{4})-(\d{2})-(\d{2})[ _](\d{2})-(\d{2})-(\d{2})\.mkv$/i;
const SESSION_GAP_MS = 5 * 60 * 1000;

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

function getSortTime(clip: Pick<Clip, 'timestamp' | 'mtime'>): number {
  return clip.timestamp ?? clip.mtime;
}

export async function scanFolder(folder: string): Promise<ClipScanResult> {
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
        sessionId: '',
        metadata: null,
        probeStatus: 'idle',
        probeError: null,
      };
    }),
  );

  // Sort by OBS timestamp when present, otherwise mtime. This keeps clips with
  // unparseable names in chronological order instead of forcing them to the end.
  clips.sort((a, b) => {
    const byTime = getSortTime(a) - getSortTime(b);
    if (byTime !== 0) return byTime;
    const byMtime = a.mtime - b.mtime;
    if (byMtime !== 0) return byMtime;
    return a.name.localeCompare(b.name);
  });

  const sessions: ClipSession[] = [];
  let currentSession: ClipSession | null = null;
  let previousSortTime: number | null = null;

  for (const clip of clips) {
    const clipSortTime = getSortTime(clip);
    const startsNewSession =
      previousSortTime != null &&
      clipSortTime - previousSortTime > SESSION_GAP_MS;

    if (!currentSession || startsNewSession) {
      currentSession = {
        id: `session-${sessions.length + 1}`,
        clipPaths: [],
        clipCount: 0,
        totalBytes: 0,
        startedAt: clipSortTime,
      };
      sessions.push(currentSession);
    }

    clip.sessionId = currentSession.id;
    currentSession.clipPaths.push(clip.path);
    currentSession.clipCount += 1;
    currentSession.totalBytes += clip.size;
    previousSortTime = clipSortTime;
  }

  return { clips, sessions };
}
