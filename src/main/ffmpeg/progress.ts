// Parses ffmpeg's `-progress pipe:1` output. ffmpeg writes one key=value
// per line, and emits `progress=continue` (or `progress=end` at EOF) at
// the end of each tick. We accumulate fields and flush a complete tick on
// each `progress=` line.

export interface ProgressTick {
  outTimeMs?: number;
  totalSize?: number;
  speed?: string;
  /** True when ffmpeg reports `progress=end`. */
  done?: boolean;
}

export function parseProgressLine(line: string): Partial<ProgressTick> {
  const eq = line.indexOf('=');
  if (eq < 0) return {};
  const key = line.slice(0, eq).trim();
  const value = line.slice(eq + 1).trim();
  switch (key) {
    case 'out_time_ms':
    case 'out_time_us': {
      const n = Number(value);
      if (!Number.isFinite(n)) return {};
      // ffmpeg occasionally reports microseconds in `out_time_ms` (legacy
      // naming bug — it's actually µs). Either way, divide by 1000 to get ms.
      return { outTimeMs: Math.floor(n / 1000) };
    }
    case 'total_size': {
      const n = Number(value);
      return Number.isFinite(n) ? { totalSize: n } : {};
    }
    case 'speed':
      return { speed: value };
    case 'progress':
      return { done: value === 'end' };
    default:
      return {};
  }
}

export function makeProgressReader(
  onTick: (tick: ProgressTick) => void,
): (chunk: string) => void {
  let buf = '';
  let cur: ProgressTick = {};

  return (chunk) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      const parsed = parseProgressLine(line);
      Object.assign(cur, parsed);
      // A `progress=` line marks the end of a tick — flush.
      if (parsed.done !== undefined) {
        onTick({ ...cur });
        cur = {};
      }
    }
  };
}
