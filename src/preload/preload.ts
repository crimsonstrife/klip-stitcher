import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { CH } from '../shared/ipc-channels';
import type { Api, JobDone, JobProgress } from '../shared/ipc-contract';

const api: Api = {
  // M0
  getFfmpegPaths: () => ipcRenderer.invoke(CH.FFMPEG_PATHS),
  getPreferences: () => ipcRenderer.invoke(CH.APP_PREFERENCES_GET),

  // M1
  pickFolder: () => ipcRenderer.invoke(CH.DIALOG_PICK_FOLDER),
  pickOutputFile: (request) =>
    ipcRenderer.invoke(CH.DIALOG_PICK_OUTPUT, request),
  scanFolder: (folder) => ipcRenderer.invoke(CH.CLIPS_SCAN, folder),
  probeClips: (paths) => ipcRenderer.invoke(CH.CLIPS_PROBE, paths),
  generateThumbnails: (requests) =>
    ipcRenderer.invoke(CH.CLIPS_THUMBNAIL, requests),
  startStitch: (opts) => ipcRenderer.invoke(CH.JOB_START, opts),
  cancelStitch: (jobId) => ipcRenderer.invoke(CH.JOB_CANCEL, jobId),
  openInExplorer: (filePath) =>
    ipcRenderer.invoke(CH.APP_OPEN_PATH, filePath),
  onProgress: (callback) => {
    const handler = (_e: IpcRendererEvent, payload: JobProgress) =>
      callback(payload);
    ipcRenderer.on(CH.JOB_PROGRESS, handler);
    return () => {
      ipcRenderer.removeListener(CH.JOB_PROGRESS, handler);
    };
  },
  onJobDone: (callback) => {
    const handler = (_e: IpcRendererEvent, payload: JobDone) =>
      callback(payload);
    ipcRenderer.on(CH.JOB_DONE, handler);
    return () => {
      ipcRenderer.removeListener(CH.JOB_DONE, handler);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);
