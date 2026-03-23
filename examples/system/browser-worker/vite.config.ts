import { defineConfig } from 'vite';

/**
 * vite.config.ts — app bundle + dev/preview server
 *
 * src/app.ts → dist/assets/app-[hash].js
 *
 * Build order:
 *   yarn build:worker  → dist/worker.js
 *   yarn build:app     → dist/index.html + dist/assets/app.js
 *   yarn start         → yarn build && vite preview
 */
export default defineConfig({
  resolve: {
    conditions: ['browser', 'module', 'default'],
    mainFields: ['browser', 'module', 'main'],
  },

  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: 'index.html',
    },
  },

  preview: {
    port: 4173,
  },

  server: {
    proxy: {
      '/rpc': {
        target: 'http://127.0.0.1:18332',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rpc/, ''),
      },
    },
  },
});
