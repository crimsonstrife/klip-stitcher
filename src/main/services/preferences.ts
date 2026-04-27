import path from 'node:path';
import Store from 'electron-store';
import type {
  AppPreferences,
  OutputFormat,
} from '../../shared/ipc-contract';

const DEFAULT_PREFERENCES: AppPreferences = {
  lastFolder: null,
  lastOutputPath: null,
  preferredOutputFormat: 'mkv',
};

const store = new Store<AppPreferences>({
  name: 'preferences',
  defaults: DEFAULT_PREFERENCES,
});

export function outputFormatFromPath(
  filePath: string | null | undefined,
): OutputFormat | null {
  const ext = path.extname(filePath ?? '').toLowerCase();
  if (ext === '.mp4') return 'mp4';
  if (ext === '.mkv') return 'mkv';
  return null;
}

export function getPreferences(): AppPreferences {
  return {
    lastFolder: store.get('lastFolder') ?? null,
    lastOutputPath: store.get('lastOutputPath') ?? null,
    preferredOutputFormat:
      store.get('preferredOutputFormat') ?? DEFAULT_PREFERENCES.preferredOutputFormat,
  };
}

export function rememberLastFolder(folderPath: string | null): AppPreferences {
  if (folderPath) {
    store.set('lastFolder', folderPath);
  } else {
    store.delete('lastFolder');
  }
  return getPreferences();
}

export function rememberLastOutputPath(
  outputPath: string | null,
): AppPreferences {
  if (outputPath) {
    store.set('lastOutputPath', outputPath);
    const format = outputFormatFromPath(outputPath);
    if (format) {
      store.set('preferredOutputFormat', format);
    }
  } else {
    store.delete('lastOutputPath');
  }
  return getPreferences();
}
