import { defineConfig } from 'vite';

export default defineConfig({
  // Root is the project dir — Vite serves index.html
  root: '.',
  build: {
    target: 'es2020',
    outDir: 'dist/renderer',
    // index.html has no <script type="module"> pointing to renderer source —
    // the renderer is plain HTML + inline scripts that call window.crawlerAPI
    // (exposed by preload.ts via contextBridge).
    // Nothing to bundle on the renderer side.
    rollupOptions: {
      input: 'index.html',
    },
  },
  server: {
    port: 5173,
  },
});
