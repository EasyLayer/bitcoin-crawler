import { defineConfig } from 'vite';

/**
 * vite.worker.config.ts — SharedWorker bundle
 *
 * src/worker.ts → dist/worker.js
 *
 * bitcoin-crawler dist/browser/index.js is already a fully self-contained bundle:
 *   - @nestjs/core, @nestjs/common (with perf_hooks/crypto shims)
 *   - @easylayer/common/*, @easylayer/bitcoin, @easylayer/transport-sdk
 *   - typeorm/browser, bitcoinjs-lib, bip39, rxjs, reflect-metadata
 *   - @sqlite.org/sqlite-wasm
 *   - process/Buffer globals injected in the crawler browser bundle
 *
 * So this config does not need any sqlite-specific aliases or polyfills.
 * Vite just bundles worker.ts and resolves bitcoin-crawler to its browser build
 * via the "browser" condition in package.json exports.
 */
export default defineConfig({
  publicDir: 'public',
  resolve: {
    conditions: ['browser', 'module', 'default'],
    mainFields: ['browser', 'module', 'main'],
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 10000,

    lib: {
      entry: 'src/worker.ts',
      formats: ['es'],
      fileName: () => 'worker.js',
    },

    rollupOptions: {
      external: ['electron'], // TODO: think how we can hanle this in bitcoin-crawler
      output: {
        inlineDynamicImports: true,
        format: 'es',
      },
    },
  },
});