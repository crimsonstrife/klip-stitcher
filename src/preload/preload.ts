import { contextBridge, ipcRenderer } from 'electron';
import { CH } from '../shared/ipc-channels';
import type { Api } from '../shared/ipc-contract';

const api: Api = {
  getFfmpegPaths: () => ipcRenderer.invoke(CH.FFMPEG_PATHS),
};

contextBridge.exposeInMainWorld('api', api);
