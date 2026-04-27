import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vitejs.dev/config
export default defineConfig({
  // Without `base: './'`, Vite emits absolute asset paths (`/assets/...`) which
  // `file://` resolves against the drive root in the packaged Electron build —
  // breaking asset loading. Relative paths work for both file:// and dev-server.
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});
