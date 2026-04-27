export const CH = {
  // M0
  FFMPEG_PATHS: 'app:ffmpeg-paths',

  // M1 — dialogs
  DIALOG_PICK_FOLDER: 'dialog:pick-folder',
  DIALOG_PICK_OUTPUT: 'dialog:pick-output',

  // M1 — clips
  CLIPS_SCAN: 'clips:scan',

  // M1 — jobs
  JOB_START: 'job:start',
  JOB_CANCEL: 'job:cancel',
  JOB_PROGRESS: 'job:progress', // push: main -> renderer
  JOB_DONE: 'job:done', // push: main -> renderer

  // M1 — shell
  APP_OPEN_PATH: 'app:open-path',
} as const;

export type IpcChannel = (typeof CH)[keyof typeof CH];
