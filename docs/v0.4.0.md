---
title: Bitcoin Crawler
sidebar_label: Bitcoin Crawler
---

# @easylayer/bitcoin-crawler

A self-hosted framework for building custom Bitcoin blockchain indexers.  
Define what data you care about, point it at a node, and get a live + historical event stream with automatic reorg handling.

Built on **Event Sourcing + CQRS**. Ships **CJS, ESM, and a browser bundle** — runs in Node.js servers, Electron desktop apps, and browser SharedWorkers with the same API.

---

## Installation

```bash
npm install @easylayer/bitcoin-crawler
# or
yarn add @easylayer/bitcoin-crawler
```

**Requirements:** Node.js ≥ 20 · TypeScript (recommended) · Bitcoin node or RPC provider (e.g. QuickNode)

---

## How It Works

1. You define a **Model** — a class or declarative object that says what state to track.
2. `bootstrap()` starts the crawler. It connects to your Bitcoin node, syncs history, then follows new blocks in real time.
3. As blocks arrive, your model's processing function is called. You emit events via `applyEvent()`.
4. Events are persisted in the EventStore and streamed to clients over the transport of your choice.
5. Clients query the current model state or subscribe to live events via [`@easylayer/transport-sdk`](https://www.npmjs.com/package/@easylayer/transport-sdk).

---

## Quick Start (Node.js)

### 1. Create a model

```ts
// model.ts
import { Model } from '@easylayer/bitcoin-crawler';
import type { Block } from '@easylayer/bitcoin';

export class DepositTracker extends Model {
  static override modelId = 'deposits';

  public balances = new Map<string, bigint>();

  async processBlock(ctx: { block: Block }) {
    const deposits: { address: string; value: string }[] = [];

    for (const tx of ctx.block.tx ?? []) {
      for (const out of tx.vout ?? []) {
        const address = out.scriptPubKey?.addresses?.[0];
        if (address) deposits.push({ address, value: String(out.value) });
      }
    }

    if (deposits.length) {
      this.applyEvent('DepositReceived', ctx.block.height, { deposits });
    }
  }

  protected onDepositReceived(e: any) {
    for (const { address, value } of e.payload.deposits) {
      const prev = this.balances.get(address) ?? 0n;
      this.balances.set(address, prev + BigInt(value));
    }
  }
}
```

### 2. Bootstrap

```ts
// main.ts
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { DepositTracker } from './model';

bootstrap({ Models: [DepositTracker] });
```

### 3. Configure via `.env`

```bash
# Minimum required
PROVIDER_NETWORK_RPC_URLS=http://user:pass@your-node:8332

# Optional — what to index
START_BLOCK_HEIGHT=840000       # omit to live-only mode
NETWORK_TYPE=mainnet            # mainnet | testnet | regtest

# EventStore (default: SQLite)
EVENTSTORE_DB_TYPE=sqlite

# Transport (enable at least one for clients to connect)
TRANSPORT_HTTP_HOST=0.0.0.0
TRANSPORT_HTTP_PORT=3000
```

### 4. Query the state

```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"name":"GetModelsQuery","dto":{"modelIds":["deposits"]}}'
```

---

## Models

### Declarative Model (less boilerplate)

Define state, sources (per vout/vin/block), and reducers separately.  
`sources` are called at the granularity you need; results accumulate in `ctx.locals`.

```ts
import type { DeclarativeModel } from '@easylayer/bitcoin-crawler';
import { compileStateModelBTC } from '@easylayer/bitcoin-crawler';

const BalanceModel: DeclarativeModel<any> = {
  modelId: 'balances',

  state: {
    balances: new Map<string, bigint>(),
  },

  sources: {
    async vout(ctx) {
      const address = ctx.vout.scriptPubKey?.addresses?.[0];
      if (!address) return;
      return { address, value: String(ctx.vout.value) };
    },

    async block(ctx) {
      const deposits = ctx.locals.vout; // results from vout()
      if (deposits.length > 0) {
        ctx.applyEvent('DepositReceived', ctx.block.height, { deposits });
      }
    },
  },

  reducers: {
    DepositReceived(state, e) {
      for (const { address, value } of e.payload.deposits) {
        const prev = state.balances.get(address) ?? 0n;
        state.balances.set(address, prev + BigInt(value));
      }
    },
  },
};

export const Balance = compileStateModelBTC(BalanceModel);
```

### Class-Based Model (more control)

```ts
import { Model } from '@easylayer/bitcoin-crawler';
import type { Block } from '@easylayer/bitcoin';

export class BalanceTracker extends Model {
  static override modelId = 'balances';

  public balances = new Map<string, bigint>();

  async processBlock(ctx: { block: Block }) {
    const deposits = [];
    for (const tx of ctx.block.tx ?? []) {
      for (const out of tx.vout ?? []) {
        const address = out.scriptPubKey?.addresses?.[0];
        if (address) deposits.push({ address, value: String(out.value) });
      }
    }
    if (deposits.length) {
      this.applyEvent('DepositReceived', ctx.block.height, { deposits });
    }
  }

  protected onDepositReceived(e: any) {
    for (const { address, value } of e.payload.deposits) {
      const prev = this.balances.get(address) ?? 0n;
      this.balances.set(address, prev + BigInt(value));
    }
  }
}
```

**Rule of thumb:** use **declarative** for straightforward per-output/per-input filtering, **class-based** when you need full control over iteration, cross-transaction state, or complex branching logic.

---

## Bootstrap Options

```ts
bootstrap({
  Models: [],          // Your model classes / compiled declarative models
  QueryHandlers: [],   // Custom query handler classes (extend the built-in API)
  EventHandlers: [],   // Custom event handler classes
  Providers: [],       // Additional NestJS providers
});
```

All fields are optional. You can bootstrap with an empty `Models` array to only use system models and subscribe to their events.

---

## Custom Query Handlers

Extend the built-in query API by providing your own handlers:

```ts
import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';

class GetBalanceQuery {
  constructor(public readonly addresses: string[]) {}
}

@QueryHandler(GetBalanceQuery)
class GetBalanceQueryHandler implements IQueryHandler<GetBalanceQuery> {
  constructor(private readonly modelFactory: any) {}

  async execute(query: GetBalanceQuery) {
    const model = await this.modelFactory.restoreModel(BalanceTracker);
    return query.addresses.map((a) => ({
      address: a,
      balance: model.balances.get(a).toString(),
    }));
  }
}

bootstrap({
  Models: [BalanceTracker],
  QueryHandlers: [GetBalanceQueryHandler],
});
```

Query it:
```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"name":"GetBalanceQuery","dto":{"addresses":["1A1z..."]}}'
```

---

## Platform Support

The package ships three bundles. Your bundler or Node.js resolves the right one automatically via `package.json` `exports` — **no manual path imports needed**.

| Environment | Bundle | Import |
|---|---|---|
| Node.js (CJS) | `dist/index.js` | `import { bootstrap } from '@easylayer/bitcoin-crawler'` |
| Node.js (ESM) | `dist/esm/index.js` | same — resolved by bundler |
| Browser / SharedWorker | `dist/browser/index.js` | same — bundler picks `browser` condition |
| Electron main process | Node bundle | same as Node.js |

### Node.js (server / Docker)

Standard usage as shown in Quick Start above.  
Use SQLite for local dev, PostgreSQL for production.

```bash
# PostgreSQL
EVENTSTORE_DB_TYPE=postgres
EVENTSTORE_DB_HOST=localhost
EVENTSTORE_DB_PORT=5432
EVENTSTORE_DB_NAME=crawler
EVENTSTORE_DB_USERNAME=user
EVENTSTORE_DB_PASSWORD=pass
```

### Electron (Desktop)

Run `bootstrap()` in the **Electron main process** after the window is created so that `BrowserWindow.webContents` is available when the transport initializes.

```ts
// electron/main.ts
import { app, BrowserWindow } from 'electron';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BalanceTracker } from '../src/model';

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true },
  });
  win.loadFile('dist/renderer/index.html');

  // Bootstrap AFTER window is open
  bootstrap({ Models: [BalanceTracker] });
});
```

```bash
# .env for Electron
TRANSPORT_IPC_TYPE=electron-ipc
EVENTSTORE_DB_TYPE=sqlite
EVENTSTORE_DB_NAME=./eventstore/bitcoin.db
PROVIDER_NETWORK_RPC_URLS=http://user:pass@node:8332
```

In the **renderer process**, connect via `@easylayer/transport-sdk`:

```ts
import { Client } from '@easylayer/transport-sdk';

const client = new Client({
  transport: { type: 'electron-ipc-renderer', options: { pongPassword: 'pw' } },
});

client.subscribe('DepositReceived', (evt) => console.log(evt));
const state = await client.query('GetModelsQuery', { modelIds: ['balances'] });
```

### Browser (SharedWorker)

The browser bundle has **no Node.js dependencies** and uses `sql.js` + IndexedDB for storage.  
Run the crawler inside a `SharedWorker` — one instance is shared across all open tabs.

```ts
// worker.ts  (entry point compiled as SharedWorker)
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BalanceTracker } from './model';

// Port queue — capture ports that connect before bootstrap completes
(self as any).__pendingSharedWorkerPorts = [];
(self as any).onconnect = (e: MessageEvent) => {
  const port = e.ports[0];
  port.start();
  (self as any).__pendingSharedWorkerPorts.push(port);
};

// In the browser there is no process.env; use __ENV instead
(self as any).__ENV = {
  NODE_ENV: 'development',
  NETWORK_TYPE: 'mainnet',
  NETWORK_PROVIDER_TYPE: 'rpc',
  PROVIDER_NETWORK_RPC_URLS: 'http://user:pass@your-node:8332',
  EVENTSTORE_DB_TYPE: 'sqljs',
  TRANSPORT_OUTBOX_ENABLE: '1',
  TRANSPORT_OUTBOX_KIND: 'shared-worker-server',
  EVENTSTORE_SQLITE_RUNTIME_BASE_URL: '/sqlite',
};

bootstrap({ Models: [BalanceTracker] });
```

In any **browser window**, connect via `@easylayer/transport-sdk`:

```ts
import { Client } from '@easylayer/transport-sdk';

const client = new Client({
  transport: {
    type: 'shared-worker',
    options: { url: '/worker.bundle.js', pongPassword: 'pw' },
  },
});

client.subscribe('DepositReceived', (evt) => console.log(evt));
const state = await client.query('GetModelsQuery', { modelIds: ['balances'] });
```

> **Note:** `query()` is only available for `shared-worker` and `electron-ipc-renderer` browser transports.  
> Browser WebSocket transport supports `subscribe` only.

---

<!-- QUERY-API-START -->
## Query API Reference

### Core Queries

#### FetchEventsQuery

Retrieves events for one or more models with pagination and filtering options

🔄 **Supports Streaming**

**Parameters:**

| Parameter | Type | Required | Description | Default | Example |
|-----------|------|----------|-------------|---------|----------|
| `modelIds` | array | ✅ | Array of model IDs to fetch events for |  | `["mempool-1","network-1"]` |
| `filter` | any |  | Filter criteria for events |  | `{"blockHeight":100,"version":5}` |
| `paging` | any |  | Pagination settings for event retrieval |  | `{"limit":10,"offset":0}` |
| `streaming` | boolean |  | Enable streaming response for large event datasets | `false` | `true` |

**Example Request:**

```json
{
  "requestId": "uuid-fetch-1",
  "action": "query",
  "payload": {
    "constructorName": "FetchEventsQuery",
    "dto": {
      "modelIds": [
        "mempool-1"
      ],
      "filter": {
        "blockHeight": 100
      },
      "paging": {
        "limit": 10,
        "offset": 0
      }
    }
  }
}
```

**Example Response:**

```json
{
  "events": [
    {
      "aggregateId": "mempool-1",
      "version": 5,
      "blockHeight": 100,
      "type": "BitcoinMempoolInitializedEvent",
      "payload": {
        "allTxidsFromNode": [],
        "isSynchronized": false
      }
    }
  ],
  "total": 100
}
```

---

#### GetModelsQuery

Retrieves the current state of one or more models at a specified block height

**Parameters:**

| Parameter | Type | Required | Description | Default | Example |
|-----------|------|----------|-------------|---------|----------|
| `modelIds` | array | ✅ | Array of model IDs to retrieve current state for |  | `["mempool-1","network-1"]` |
| `filter` | any |  | Filter criteria for model state retrieval |  | `{"blockHeight":100}` |

**Example Request:**

```json
{
  "requestId": "uuid-models-1",
  "action": "query",
  "payload": {
    "constructorName": "GetModelsQuery",
    "dto": {
      "modelIds": [
        "mempool-1",
        "network-1"
      ],
      "filter": {
        "blockHeight": 100
      }
    }
  }
}
```

**Example Response:**

```json
[
  {
    "aggregateId": "mempool-1",
    "state": {
      "totalTxids": 50000,
      "loadedTransactions": 45000,
      "isSynchronized": true
    }
  },
  {
    "aggregateId": "network-1",
    "state": {
      "size": 1000,
      "currentHeight": 850000,
      "isEmpty": false
    }
  }
]
```

---

### Network Queries

#### GetNetworkStatsQuery

Retrieves blockchain network statistics and chain validation status

**Example Request:**

```json
{
  "requestId": "uuid-8",
  "action": "query",
  "payload": {
    "constructorName": "GetNetworkStatsQuery",
    "dto": {}
  }
}
```

**Example Response:**

```json
{
  "size": 1000,
  "maxSize": 2000,
  "currentHeight": 850000,
  "firstHeight": 849000,
  "isEmpty": false,
  "isFull": false,
  "isValid": true
}
```

---

#### GetNetworkBlockQuery

Retrieves a specific block from the blockchain network by height

**Parameters:**

| Parameter | Type | Required | Description | Default | Example |
|-----------|------|----------|-------------|---------|----------|
| `height` | number | ✅ | Block height to retrieve |  | `850000` |

**Example Request:**

```json
{
  "requestId": "uuid-5",
  "action": "query",
  "payload": {
    "constructorName": "GetNetworkBlockQuery",
    "dto": {
      "height": 850000
    }
  }
}
```

**Example Response:**

```json
{
  "block": {
    "height": 850000,
    "hash": "00000000000000000002a7c4c1e48d76c5a37902165a270156b7a8d72728a054",
    "previousblockhash": "00000000000000000008b3a92d5e735e4e8e8e1b2c6f8a3b5d9f2c1a7e4b8d6c",
    "tx": [
      "tx1",
      "tx2",
      "tx3"
    ]
  },
  "exists": true,
  "chainStats": {
    "currentHeight": 850500,
    "totalBlocks": 1000
  }
}
```

---

#### GetNetworkBlocksQuery

Retrieves multiple blocks from the blockchain network (last N blocks or all blocks)

**Parameters:**

| Parameter | Type | Required | Description | Default | Example |
|-----------|------|----------|-------------|---------|----------|
| `lastN` | number |  | Number of recent blocks to retrieve (defaults to 10 if neither lastN nor all specified) | `10` | `10` |
| `all` | boolean |  | Retrieve all blocks in the chain (overrides lastN parameter) | `false` |  |

**Example Request:**

```json
{
  "requestId": "uuid-6",
  "action": "query",
  "payload": {
    "constructorName": "GetNetworkBlocksQuery",
    "dto": {
      "lastN": 10
    }
  }
}
```

**Example Response:**

```json
{
  "blocks": [
    {
      "height": 850000,
      "hash": "000...054",
      "previousblockhash": "000...d6c",
      "tx": [
        "tx1",
        "tx2"
      ]
    }
  ],
  "totalCount": 1000,
  "requestedCount": 10,
  "chainStats": {
    "currentHeight": 850000,
    "firstHeight": 849000
  }
}
```

---

#### GetNetworkLastBlockQuery

Retrieves the last (most recent) block from the blockchain network

**Example Request:**

```json
{
  "requestId": "uuid-7",
  "action": "query",
  "payload": {
    "constructorName": "GetNetworkLastBlockQuery",
    "dto": {}
  }
}
```

**Example Response:**

```json
{
  "lastBlock": {
    "height": 850000,
    "hash": "00000000000000000002a7c4c1e48d76c5a37902165a270156b7a8d72728a054",
    "previousblockhash": "00000000000000000008b3a92d5e735e4e8e8e1b2c6f8a3b5d9f2c1a7e4b8d6c",
    "tx": [
      "tx1",
      "tx2",
      "tx3"
    ]
  },
  "hasBlocks": true,
  "chainStats": {
    "size": 1000,
    "currentHeight": 850000,
    "isEmpty": false
  }
}
```

---

### Mempool Queries

#### CheckMempoolTransactionFullQuery

Full check of a mempool transaction: existence, load status, providers, feeRate; optionally metadata and transaction.

**Parameters:**

| Parameter | Type | Required | Description | Default | Example |
|-----------|------|----------|-------------|---------|----------|
| `txid` | string | ✅ | Transaction ID to check in mempool |  | `"abc123def4567890abc123def4567890abc123def4567890abc123def4567890"` |
| `includeMetadata` | boolean |  | Include mempool metadata for the tx | `false` |  |
| `includeTransaction` | boolean |  | Include normalized transaction object | `true` |  |

**Example Request:**

```json
{
  "requestId": "uuid-1",
  "action": "query",
  "payload": {
    "constructorName": "CheckMempoolTransactionFullQuery",
    "dto": {
      "txid": "abc123…7890",
      "includeMetadata": true,
      "includeTransaction": true
    }
  }
}
```

**Example Response:**

```json
{
  "txid": "abc123…7890",
  "exists": true,
  "isLoaded": true,
  "providers": [
    "provider_0",
    "provider_1"
  ],
  "feeRate": 52.3,
  "metadata": {
    "fee": 20000,
    "vsize": 382
  },
  "transaction": {
    "txid": "abc123…7890",
    "vsize": 382
  }
}
```

---

#### GetMempoolOverviewQuery

Retrieves a concise overview of mempool: stats, size estimates, sync progress, providers.

**Example Request:**

```json
{
  "requestId": "uuid-2",
  "action": "query",
  "payload": {
    "constructorName": "GetMempoolOverviewQuery",
    "dto": {}
  }
}
```

**Example Response:**

```json
{
  "stats": {
    "totalTxids": 50213
  },
  "size": {
    "estimatedMemoryUsage": {
      "total": 134217728
    }
  },
  "sync": {
    "progress": 0.91,
    "totalExpected": 48000,
    "loaded": 43680,
    "remaining": 4320
  },
  "providers": [
    "provider_0",
    "provider_1"
  ]
}
```

---


<!-- QUERY-API-END -->

---

## Key Configuration

```bash
# Node access
PROVIDER_NETWORK_RPC_URLS=http://user:pass@your-node:8332
NETWORK_PROVIDER_TYPE=rpc          # rpc | rpc-zmq | p2p

# What to index
START_BLOCK_HEIGHT=840000          # omit to start live-only
NETWORK_TYPE=mainnet

# Storage
EVENTSTORE_DB_TYPE=sqlite          # or: postgres

# Transport (pick one or more)
TRANSPORT_HTTP_HOST=0.0.0.0
TRANSPORT_HTTP_PORT=3000
# TRANSPORT_WS_HOST=0.0.0.0
# TRANSPORT_WS_PORT=3001
```

### Provider strategies

| `NETWORK_PROVIDER_TYPE` | Description |
|---|---|
| `rpc` | JSON-RPC over HTTP — most common, works with any Bitcoin node or QuickNode |
| `rpc-zmq` | RPC + ZMQ subscription for instant new-block notifications |
| `p2p` | Native P2P Bitcoin protocol — no RPC node required |

---

## Client Integration

Use [`@easylayer/transport-sdk`](https://www.npmjs.com/package/@easylayer/transport-sdk) to connect from any environment.

```ts
import { Client } from '@easylayer/transport-sdk';

const client = new Client({
  transport: {
    type: 'http',
    inbound: { webhookUrl: 'http://0.0.0.0:4000/events', pongPassword: 'pw' },
    query: { baseUrl: 'http://localhost:3000' },
  },
});

client.subscribe('DepositReceived', (evt) => console.log(evt.payload));
const result = await client.query('GetModelsQuery', { modelIds: ['balances'] });
```

See the [Transport SDK docs](https://www.npmjs.com/package/@easylayer/transport-sdk) for all transport options (WS, IPC, Electron, SharedWorker).

---

## System Events

The crawler emits these built-in events regardless of your models:

**Network:**
- `BitcoinNetworkInitializedEvent` — crawler started
- `BitcoinNetworkBlocksAddedEvent` — `{ blocks: LightBlock[] }` — new confirmed blocks
- `BitcoinNetworkReorganizedEvent` — `{ blocks: LightBlock[] }` — reorged-out blocks
- `BitcoinNetworkClearedEvent` — chain state was reset

**Mempool** (when enabled):
- `BitcoinMempoolInitializedEvent`
- `BitcoinMempoolRefreshedEvent` — new snapshot from node
- `BitcoinMempoolSyncProcessedEvent` — batch of transactions loaded
- `BitcoinMempoolSynchronizedEvent` — full sync cycle complete

---

## Examples

| Example | What it shows |
|---|---|
| `examples/system/class-model` | Class-based model, SQLite, HTTP transport |
| `examples/system/declarative-model` | Declarative model |
| `examples/system/postgres` | PostgreSQL eventstore |
| `examples/system/transport` | Multiple transports configured together |
| `examples/system/docker` | Dockerfile + full Docker setup |
| `examples/system/desktop` | Electron desktop app |
| `examples/system/browser-worker` | SharedWorker in the browser |
| `examples/business/base-wallet-watcher` | Simple address balance tracker |
| `examples/business/advanced-wallet-watcher` | Full UTXO model with custom queries |

---

<!-- CONFIG-START -->
## Configuration Reference

### AppConfig

| Property | Type | Description | Default | Required |
|---|---|---|---|:---:|
| `NODE_ENV` | string | Node environment | `"development"` | ✅ |
| `LOG_LEVEL` | string | Minimum log level to output. Ignored if TRACE=1. Defaults to "info" when not set. |  |  |
| `LOGS_FILE` | string | If set, structured logs (NDJSON) are appended to this file. When unset, logs go to stdout. |  |  |
| `TRACE` | string | When set to "1", forces trace-level logging regardless of LOG_LEVEL (except in test). |  |  |

### BlocksQueueConfig

| Property | Type | Description | Default | Required |
|---|---|---|---|:---:|
| `BLOCKS_QUEUE_LOADER_STRATEGY_NAME` | string | Loader strategy name for the Bitcoin blocks queue. | `"rpc"` | ✅ |

### BootstrapConfig

| Property | Type | Description | Default | Required |
|---|---|---|---|:---:|

### BusinessConfig

| Property | Type | Description | Default | Required |
|---|---|---|---|:---:|
| `MAX_BLOCK_HEIGHT` | number | Maximum block height to be processed. Defaults to infinity. | `9007199254740991` | ✅ |
| `START_BLOCK_HEIGHT` | number | The block height from which processing begins. If not set, only listen to new blocks. |  |  |
| `NETWORK_TYPE` | string | Bitcoin network type | `"mainnet"` | ✅ |
| `NETWORK_NATIVE_CURRENCY_SYMBOL` | string | Symbol of the native currency (BTC, LTC, DOGE, etc.) |  | ✅ |
| `NETWORK_NATIVE_CURRENCY_DECIMALS` | number | Decimals of the native currency |  | ✅ |
| `NETWORK_TARGET_BLOCK_TIME` | number | Target block time in milliseconds |  | ✅ |
| `NETWORK_HAS_SEGWIT` | boolean | Whether the network supports SegWit |  | ✅ |
| `NETWORK_HAS_TAPROOT` | boolean | Whether the network supports Taproot |  | ✅ |
| `NETWORK_HAS_RBF` | boolean | Whether the network supports Replace-by-Fee |  | ✅ |
| `NETWORK_HAS_CSV` | boolean | Whether the network supports CheckSequenceVerify |  | ✅ |
| `NETWORK_HAS_CLTV` | boolean | Whether the network supports CheckLockTimeVerify |  | ✅ |
| `NETWORK_MAX_BLOCK_SIZE` | number | Maximum block size in bytes (1MB for Bitcoin, 32MB for BCH) |  | ✅ |
| `NETWORK_MAX_BLOCK_WEIGHT` | number | Maximum block weight in weight units |  | ✅ |
| `NETWORK_DIFFICULTY_ADJUSTMENT_INTERVAL` | number | Difficulty adjustment interval in blocks |  | ✅ |
| `MEMPOOL_MIN_FEE_RATE` | number | Minimum fee rate for caching transactions in sat/vB |  | ✅ |

### EventStoreConfig

| Property | Type | Description | Default | Required |
|---|---|---|---|:---:|
| `EVENTSTORE_DB_NAME` | string | For SQLite: folder path where the database file will be created; For Postgres: name of the database to connect to. | `"resolve(process.cwd(), eventstore"` | ✅ |
| `EVENTSTORE_DB_TYPE` | string | Type of database for the eventstore. | `"sqlite"` | ✅ |
| `EVENTSTORE_DB_SYNCHRONIZE` | boolean | Automatic synchronization that creates or updates tables and columns. Use with caution. | `true` | ✅ |
| `EVENTSTORE_DB_HOST` | string | Host for the eventstore database connection. |  |  |
| `EVENTSTORE_DB_PORT` | number | Port for the eventstore database connection. |  |  |
| `EVENTSTORE_DB_USERNAME` | string | Username for the eventstore database connection. |  |  |
| `EVENTSTORE_DB_PASSWORD` | string | Password for the eventstore database connection. |  |  |
| `EVENTSTORE_SQLITE_RUNTIME_BASE_URL` | string | Base URL for @sqlite.org/sqlite-wasm browser runtime files. Only used in browser (sqlite-opfs) mode. The directory must contain index.mjs, sqlite3.wasm, and required worker runtime files such as sqlite3-worker1.mjs. |  |  |

### getUnifiedEnv

| Property | Type | Description | Default | Required |
|---|---|---|---|:---:|

### ProvidersConfig

| Property | Type | Description | Default | Required |
|---|---|---|---|:---:|
| `NETWORK_PROVIDER_TYPE` | string | Type of the network provider |  | ✅ |
| `MEMPOOL_PROVIDER_TYPE` | string | Type of the mempool provider - only RPC supported |  | ✅ |
| `PROVIDER_RPC_REQUEST_TIMEOUT` | number | RPC request timeout in milliseconds for all providers |  | ✅ |
| `PROVIDER_NETWORK_RPC_URLS` | undefined | Network RPC URLs as comma-separated list |  |  |
| `PROVIDER_NETWORK_ZMQ_ENDPOINT` | string | Network ZMQ endpoint for real-time notifications |  |  |
| `PROVIDER_MEMPOOL_RPC_URLS` | undefined | Mempool RPC URLs as comma-separated list |  |  |
| `PROVIDER_P2P_CONNECTION_TIMEOUT` | number | P2P connection timeout in milliseconds for network provider |  | ✅ |
| `PROVIDER_P2P_MAX_PEERS` | number | Maximum number of P2P peers to connect for network provider |  | ✅ |
| `PROVIDER_NETWORK_P2P_PEERS` | undefined | Network P2P peers as comma-separated host:port pairs |  |  |
| `PROVIDER_NETWORK_P2P_MAX_BLOCKS_BATCH_SIZE` | number | Maximum blocks batch size for network P2P requests |  | ✅ |
| `PROVIDER_RATE_LIMIT_MAX_BATCH_SIZE` | number | Maximum batch size for requests for all providers |  | ✅ |
| `PROVIDER_RATE_LIMIT_MAX_CONCURRENT_REQUESTS` | number | Maximum concurrent requests for providers |  | ✅ |
| `PROVIDER_RATE_LIMIT_REQUEST_DELAY_MS` | number | Delay between batches in milliseconds for providers |  | ✅ |

<!-- CONFIG-END -->

---

## License

AGPL-3.0-only. See [LICENSE](https://github.com/easylayer/bitcoin-crawler/blob/main/LICENSE).
