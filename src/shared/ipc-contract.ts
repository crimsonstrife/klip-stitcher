export interface FfmpegPaths {
  ffmpeg: string;
  ffprobe: string;
}

export interface Api {
  getFfmpegPaths(): Promise<FfmpegPaths>;
}

declare global {
  interface Window {
    api: Api;
  }
}

export {};
