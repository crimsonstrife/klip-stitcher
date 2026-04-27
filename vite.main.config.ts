import { defineConfig } from 'vite';
import path from 'node:path';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@main': path.resolve(__dirname, 'src/main'),
    },
  },
  build: {
    rollupOptions: {
      // ffmpeg-static / ffprobe-static use __dirname to locate their bundled
      // binary; bundling them would break that lookup. Keep them external so
      // they're require()'d from node_modules at runtime in dev. In production
      // the binaries are copied to resources/ via Forge's extraResource.
      external: ['ffmpeg-static', 'ffprobe-static'],
    },
  },
});
