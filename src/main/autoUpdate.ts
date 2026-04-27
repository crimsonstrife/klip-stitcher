import { app } from 'electron';
import {
  UpdateSourceType,
  updateElectronApp,
} from 'update-electron-app';

const PUBLIC_REPO = 'crimsonstrife/klip-stitcher';

function canUseAutoUpdates(): boolean {
  if (!app.isPackaged) {
    return false;
  }

  return process.platform === 'win32' || process.platform === 'darwin';
}

export function initializeAutoUpdates(): void {
  if (!canUseAutoUpdates()) {
    return;
  }

  try {
    updateElectronApp({
      updateSource: {
        type: UpdateSourceType.ElectronPublicUpdateService,
        repo: PUBLIC_REPO,
      },
      updateInterval: '1 hour',
      logger: console,
    });
  } catch (error) {
    console.warn('Auto-update initialization failed.', error);
  }
}
