/**
 * rollup.browser.config.mjs — place in bitcoin-crawler/package/
 *
 * This is the FINAL self-contained browser bundle.
 *
 * Build order:
 *   yarn build:cjs                  → dist/
 *   yarn build:esm                  → dist/esm/ (tsc, all external)
 *   yarn build:browser              → rollup reads dist/esm/browser/ → dist/browser/
 *                                     bundles everything inside
 *
 * What gets bundled IN:
 *   - all bitcoin-crawler browser source
 *   - @easylayer/common/*     → each subpackage dist/browser/index.js
 *   - @easylayer/bitcoin      → dist/browser/index.js
 *   - @easylayer/transport-sdk → dist/browser/index.js
 *   - @nestjs/core, @nestjs/common (with shims for perf_hooks, crypto)
 *   - rxjs, reflect-metadata
 *   - typeorm/browser
 *   - class-transformer, class-validator
 *   - async-mutex, uuid, lodash
 *   - process, Buffer globals via banner
 *
 * What stays EXTERNAL (cannot run in browser at all):
 *   - zeromq, bitcore-p2p (native addons)
 *   - better-sqlite3, sqlite3, pg (Node DB drivers)
 *   - electron (loaded dynamically if needed)
 *
 * After this build, browser-worker just does:
 *   import { bootstrap } from '@easylayer/bitcoin-crawler'
 *   → resolves to dist/browser/index.js — no further resolution needed
 */

import { defineConfig } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import alias from '@rollup/plugin-alias';
import { rmSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// node_modules могут быть hoisted на уровень выше
const findNodeModules = (...pkg) => {
  const local = resolve(__dirname, 'node_modules', ...pkg);
  const hoisted = resolve(__dirname, '..', 'node_modules', ...pkg);
  return existsSync(local) ? local : hoisted;
};

// ── Shims for Node built-ins used by @nestjs/core ─────────────────────────────
const nodeShimsPlugin = {
  name: 'node-shims',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'perf_hooks') return '\0shim:perf_hooks';
    if (id === 'crypto')     return '\0shim:crypto';
    if (id === 'os')         return '\0shim:os';
    if (id === 'tty')        return '\0shim:tty';
    if (id === 'readline')   return '\0shim:readline';
  },
  load(id) {
    // @nestjs/core ModuleTokenFactory uses performance.now()
    if (id === '\0shim:perf_hooks') return `
      export const performance = globalThis.performance;
      export const PerformanceObserver = globalThis.PerformanceObserver ?? null;
    `;

    // @nestjs/core ModuleTokenFactory uses createHash() for module token uniqueness
    if (id === '\0shim:crypto') return `
      export function createHash(algorithm) {
        return {
          _data: '',
          update(data) { this._data += String(data); return this; },
          digest(encoding) {
            let hash = 2166136261;
            for (let i = 0; i < this._data.length; i++) {
              hash ^= this._data.charCodeAt(i);
              hash = Math.imul(hash, 16777619) >>> 0;
            }
            const hex = hash.toString(16).padStart(8, '0');
            if (encoding === 'base64') return btoa(hex);
            return hex;
          }
        };
      }
      export function randomBytes(size) {
        const arr = new Uint8Array(size);
        globalThis.crypto.getRandomValues(arr);
        return arr;
      }
      export const webcrypto = globalThis.crypto;
      export default { createHash, randomBytes, webcrypto };
    `;

    if (id === '\0shim:os')       return `export const platform = () => 'browser'; export const EOL = '\\n'; export default { platform, EOL };`;
    if (id === '\0shim:tty')      return `export const isatty = () => false; export default { isatty };`;
    if (id === '\0shim:readline') return `export default {}; export const createInterface = () => ({});`;
  },
};

export default defineConfig({
  // Input — compiled by tsc (build:esm), all deps are bare imports
  input: './dist/esm/browser/index.js',

  output: {
    file: './dist/browser/index.js',
    format: 'es',
    sourcemap: false,
    inlineDynamicImports: true,
    banner: `import { Buffer as __Buffer__ } from 'buffer';`,
    intro: `
if (!globalThis.Buffer) globalThis.Buffer = __Buffer__;
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis.self;
if (!globalThis.process) globalThis.process = {};
if (!globalThis.process.env) globalThis.process.env = { NODE_ENV: 'production' };
if (!globalThis.process.version) globalThis.process.version = 'v18.0.0';
if (!globalThis.process.browser) globalThis.process.browser = true;
if (!globalThis.process.stdout) globalThis.process.stdout = { write: (s) => console.log(s) };
if (!globalThis.process.stderr) globalThis.process.stderr = { write: (s) => console.error(s) };
if (!globalThis.process.nextTick) globalThis.process.nextTick = (fn, ...args) => queueMicrotask(() => fn(...args));
  `.trim(),
},

  external(id) {
    if (id === 'electron' || /[/\\]node_modules[/\\]electron[/\\]/.test(id)) return true;
    if (id === '@sqlite.org/sqlite-wasm' || id.includes('sqlite3-worker')) return true;
    
    const nodeOnly = [
      'zeromq',
      'bitcore-p2p',
      'better-sqlite3',
      'sqlite3',
      'pg',
      'pg-native',
      'pg-query-stream',
      'react-native-sqlite-storage',
      'async_hooks',
      'fs',
      'path',
      'stream',
    ];
    
    return nodeOnly.some(p => id === p || id.startsWith(p + '/'));
  },

  onwarn(warning, warn) {
    // Expected for TypeScript decorator helpers in ESM output
    if (warning.code === 'THIS_IS_UNDEFINED') return;
    // Expected for bitcoinjs-lib internal structure
    if (warning.code === 'CIRCULAR_DEPENDENCY') return;
    // bip39 is CJS used as `import * as bip39` — named exports aren't statically
    // detectable by rollup, but they exist on the default export at runtime.
    if (warning.code === 'MISSING_EXPORT' && warning.exporter?.includes('bip39')) return;
    warn(warning);
  },

  plugins: [
    // 1. Shims — must be first, before any other resolution
    nodeShimsPlugin,

    // 3. Alias — redirect packages to their pre-built browser bundles
    //    and typeorm to its official browser entry
    alias({
      entries: [
        // typeorm → official browser build (no pg/sqlite3/native deps)
        { find: 'typeorm', replacement: 'typeorm/browser' },

        // @easylayer packages → their pre-built dist/browser/index.js
        // These are already self-contained bundles from previous build steps
        {
          find: /^@easylayer\/common\/(.+)$/,
          replacement: (_, sub) =>
            findNodeModules('@easylayer', 'common', sub, 'dist', 'esm', 'browser', 'index.js'),
        },
        {
          find: '@easylayer/bitcoin',
          replacement: findNodeModules('@easylayer', 'bitcoin', 'dist', 'esm', 'browser', 'index.js'),
        },
        {
          find: '@easylayer/transport-sdk',
          replacement: findNodeModules('@easylayer', 'transport-sdk', 'dist', 'esm', 'browser', 'index.js'),
        },
      ],
    }),

    // 4. JSON — needed for bip39 wordlists and other json imports
    json(),

    // 5. commonjs — converts CJS packages (@nestjs/*, class-validator, validator, etc.)
    commonjs({
      transformMixedEsModules: true,
      ignore: ['electron'],
    }),

    // 6. nodeResolve — resolves node_modules with browser conditions
    nodeResolve({
      browser: true,
      exportConditions: ['browser', 'module', 'default'],
      // false — use our shims instead of Node built-ins
      preferBuiltins: false,
    }),
  ],
});
