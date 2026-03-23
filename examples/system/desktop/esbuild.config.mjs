import { build as esbuild } from 'esbuild';

const external = [
  // Electron runtime — already provided by Electron itself
  'electron',

  // Native Node addons — cannot be bundled, electron-builder copies them separately
  'better-sqlite3',
  'sqlite3',
  'zeromq',

  // NestJS optional lazy deps — not installed, esbuild must ignore them
  '@nestjs/websockets',
  '@nestjs/websockets/socket-module',
  '@nestjs/microservices',
  '@nestjs/microservices/microservices-module',
  '@nestjs/platform-express',

  // Other optional deps
  'dtrace-provider',
  'class-transformer/storage',

  // All @easylayer/* packages must stay external so that Node.js resolves them
  // via require() cache — this ensures both NetworkTransportModule and CqrsTransportModule
  // get the SAME OutboxBatchSender class reference (critical for NestJS DI token matching).
  '@easylayer/common',
  '@easylayer/common/cqrs',
  '@easylayer/common/cqrs-transport',
  '@easylayer/common/network-transport',
  '@easylayer/common/eventstore',
  '@easylayer/common/logger',
  '@easylayer/common/arithmetic',
  '@easylayer/common/framework',
  '@easylayer/common/shared-interfaces',
  '@easylayer/common/exponential-interval-async',
  '@easylayer/bitcoin',
  '@easylayer/bitcoin-crawler',
];

// ── 1. Main process ───────────────────────────────────────────────────────────
// Bundles electron/main.ts and src/model.ts + src/query.ts into one file.
// keepNames: true is CRITICAL — NestJS DI uses class names as tokens.
// Without it esbuild renames classes and DI token matching breaks.
await esbuild({
  entryPoints: ['electron/main.ts'],
  bundle: true,
  platform: 'node',
  outfile: 'dist/electron/main.js',
  external,
  keepNames: true,
  logLevel: 'info',
});

// ── 2. Preload ────────────────────────────────────────────────────────────────
// Preload runs in a sandboxed renderer context with contextIsolation: true.
// It has access to 'electron' (ipcRenderer) but NOT to Node built-ins like
// node:path, node:fs etc. that the Node version of transport-sdk pulls in.
//
// Solution:
//   platform: 'browser' + conditions: ['browser'] → esbuild picks up the
//   browser entry of @easylayer/transport-sdk (dist/browser/index.js)
//   which only contains ElectronIpcRendererTransport — no express, no node:path.
//
// 'electron' stays external so ipcRenderer import works at runtime.
await esbuild({
  entryPoints: ['electron/preload.ts'],
  bundle: true,
  platform: 'browser',
  outfile: 'dist/electron/preload.js',
  external: ['electron'],
  keepNames: true,
  conditions: ['browser', 'module', 'default'],
  define: {
    // Suppress Vite/NestJS NODE_ENV checks inside bundled deps
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'info',
});

console.log('✓ esbuild done');
