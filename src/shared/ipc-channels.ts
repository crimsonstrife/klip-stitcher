export const CH = {
  FFMPEG_PATHS: 'app:ffmpeg-paths',
} as const;

export type IpcChannel = (typeof CH)[keyof typeof CH];
