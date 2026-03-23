/**
 * SharedWorker entry point.
 *
 * Architecture:
 *   SharedWorker (this file)
 *   └── bootstrap()
 *         ├── EventStore  (sql.js + IndexedDB — shared across all tabs)
 *         ├── BlockchainProvider (fetch-based RPC)
 *         ├── AddressUtxoWatcher model
 *         ├── GetBalanceQueryHandler (factory)
 *         └── SharedWorkerServerService  ← auto-registered via TRANSPORT_OUTBOX_KIND
 *               ├── ping → pong
 *               └── query.request → QueryBus → query.response
 */
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { AddressUtxoWatcher } from './model';
import { GetBalanceQueryHandler } from './query';

// ── Port queue ────────────────────────────────────────────────────────────────
// Capture ports that connect BEFORE SharedWorkerServerService is instantiated.
// The service drains this queue in its constructor via __pendingSharedWorkerPorts.
(self as any).__pendingSharedWorkerPorts = [];
(self as any).onconnect = (e: MessageEvent) => {
  const port = e.ports[0];
  port.start();
  ((self as any).__pendingSharedWorkerPorts as MessagePort[]).push(port);
};

// ── Configuration ─────────────────────────────────────────────────────────────
(self as any).__ENV = {
  NODE_ENV: 'development',
  NETWORK_TYPE: 'testnet',
  NETWORK_PROVIDER_TYPE: 'rpc',
  START_BLOCK_HEIGHT: '0',
  PROVIDER_NETWORK_RPC_URLS: 'http://btc:ak3p9g7s2tey@localhost:4173/rpc',
  EVENTSTORE_DB_TYPE: 'sqljs',
  TRANSPORT_OUTBOX_ENABLE: '1',
  TRANSPORT_OUTBOX_KIND: 'shared-worker-server',
  EVENTSTORE_SQLITE_RUNTIME_BASE_URL: '/sqlite' //'https://cdn.jsdelivr.net/npm/@sqlite.org/sqlite-wasm@3.51.2-build8/dist'
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────
(async () => {
  console.log('[worker] starting bitcoin crawler...');

  await bootstrap({
    Models: [AddressUtxoWatcher],
    QueryHandlers: [GetBalanceQueryHandler],
  });

  console.log('[worker] crawler ready');
})().catch((err) => {
  console.error('[worker] bootstrap failed:', err);
});
