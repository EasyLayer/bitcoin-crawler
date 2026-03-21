import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    target: 'es2020',
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: 'index.html',
        worker: 'src/worker.ts',
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'worker' ? 'worker.js' : 'assets/[name]-[hash].js',
        // Logger browser build has a top-level IIFE that references `window`
        // before any user code runs — polyfill it as the very first line.
        banner: (chunk) =>
          chunk.name === 'worker'
            ? 'if (typeof window === "undefined") { self.window = self; }'
            : '',
      },
    },
  },
  resolve: {
    conditions: ['browser', 'module', 'default'],
  },
  optimizeDeps: {
    exclude: ['sql.js'],
  },
  worker: {
    format: 'es',
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
