/// <reference types="vite/client" />

// ffprobe-static ships no .d.ts and no @types/* package exists. Only
// referenced from forge.config.ts at build time (resources/ extraResource).
// The main process resolves the binary path manually — see binaries.ts.
declare module 'ffprobe-static' {
  const ffprobeStatic: { path: string };
  export default ffprobeStatic;
}
