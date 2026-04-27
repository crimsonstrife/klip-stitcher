export interface FfmpegPaths {
  ffmpeg: string;
  ffprobe: string;
}

export interface Clip {
  /** Absolute path to the .mkv file. */
  path: string;
  /** Filename basename, e.g. "2026-03-06 19-42-13.mkv". */
  name: string;
  /** Parsed timestamp from filename (ms since epoch), or null if the
   *  filename did not match the OBS timestamp pattern. */
  timestamp: number | null;
  /** File size in bytes. */
  size: number;
  /** File modified time (ms since epoch) — used as sort tiebreaker. */
  mtime: number;
  /** Scan-time session bucket, e.g. "session-1". */
  sessionId: string;
}

export interface ClipSession {
  /** Stable scan-time identifier, e.g. "session-2". */
  id: string;
  /** Ordered clip paths belonging to the session. */
  clipPaths: string[];
  /** Number of clips in this session. */
  clipCount: number;
  /** Total byte size of all clips in this session. */
  totalBytes: number;
  /** Start time of the first clip in the session (filename timestamp or mtime fallback). */
  startedAt: number;
}

export interface ClipScanResult {
  clips: Clip[];
  sessions: ClipSession[];
}

export interface StitchOptions {
  /** Ordered list of input file paths to concatenate. */
  inputs: string[];
  /** Absolute output file path. Extension determines container. */
  output: string;
  /** Sum of input file sizes in bytes. Used for fraction estimate
   *  (stream-copy output ≈ input bytes). */
  totalBytes: number;
}

export interface JobProgress {
  jobId: string;
  /** Bytes written to output so far. */
  bytesWritten: number;
  /** Output time in ms (from `out_time_ms=` in -progress pipe:1). */
  outTimeMs: number;
  /** Speed multiplier as ffmpeg reports it, e.g. "8.5x". */
  speed: string;
  /** Approximate completion fraction 0..1 (bytesWritten / totalBytes). */
  fraction: number;
}

export type JobDone =
  | {
      jobId: string;
      status: 'success';
      output: string;
      durationMs: number;
    }
  | { jobId: string; status: 'error'; error: string }
  | { jobId: string; status: 'cancelled' };

export interface Api {
  // M0
  getFfmpegPaths(): Promise<FfmpegPaths>;
  // M1
  pickFolder(): Promise<string | null>;
  pickOutputFile(defaultName: string): Promise<string | null>;
  scanFolder(folder: string): Promise<ClipScanResult>;
  startStitch(opts: StitchOptions): Promise<string>;
  cancelStitch(jobId: string): Promise<void>;
  openInExplorer(filePath: string): Promise<void>;
  /** Subscribe to progress ticks. Returns an unsubscribe function. */
  onProgress(callback: (e: JobProgress) => void): () => void;
  /** Subscribe to job-done events (success / error / cancelled). */
  onJobDone(callback: (e: JobDone) => void): () => void;
}

declare global {
  interface Window {
    api: Api;
  }
}

export {};
