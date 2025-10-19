# EasyLayer Bitcoin Crawler Documentation

<b>Bitcoin Crawler</b> is a self-hosted framework for building custom blockchain indexers and parsers that monitor Bitcoin blockchain data both historically and in real-time.

---

<!-- KEY-FEATURES-START -->

## Overview

Bitcoin Crawler is a powerful framework designed for building custom Bitcoin blockchain indexers. It provides developers with a flexible system to track blockchain state, enabling them to build tailored blockchain analytics and monitoring solutions.

The framework is built on Event Sourcing and CQRS (Command Query Responsibility Segregation) patterns, ensuring reliable and consistent data processing. It offers multiple transport options (HTTP RPC, WebSocket, IPC, Electron, Browser) for communicating with your application and supports SQLite, PostgreSQL, and IndexedDB for event storage.

## Key Features

* **Self-Hosted & Private**: Deploy entirely on your own infrastructure — your data never leaves your servers.
* **Custom State Models**: Define only the states you need in custom model files for smaller datasets, faster queries, and lower storage overhead.
* **Live & Historical Streams**: Sync the entire chain history once and maintain a continuous real-time feed for dashboards or alerts.
* **Reorg-Proof Consistency**: Automatic fork handler rolls back and replays data for chain reorganizations of any depth — no manual intervention required.
* **Mempool Monitoring**: Track and filter unconfirmed transactions in real time to power mempool analytics and alerting.
* **2 RPC Calls per Block**: Fetch full block data with just two RPC requests to minimize node load and reduce operational cost.
* **Instant Block Snapshots**: Request the exact state of any model at a specific block height with a single call.
* **Event-Based Processing**: Create and handle custom events to track blockchain state changes with full auditability.
* **Multiple Transport Options**: Access data over HTTP RPC, WebSocket, IPC, Electron, or Browser with built-in message handling.
* **Database Flexibility**: Choose between SQLite for quick setups, PostgreSQL for production, or IndexedDB for browser.
* **Flexible Node Connectivity**: Works seamlessly with a self-hosted Bitcoin node or provider services like QuickNode via RPC, P2P, or ZMQ.

<!-- KEY-FEATURES-END -->

---

# Getting Started

## Installation

Install the Bitcoin Crawler package in your Node.js project:

```bash
npm install @easylayer/bitcoin-crawler
# or
yarn add @easylayer/bitcoin-crawler
```

**Requirements:**
- Node.js v20 or higher
- TypeScript (recommended)
- Bitcoin node access (self-hosted or provider like QuickNode)

---

# Creating Your First Model

Models define what blockchain data you want to track. There are two ways to define models:

## 1. Declarative Model (Simpler)

**Example: Address Balance Tracker**

```typescript
import type { DeclarativeModel } from '@easylayer/bitcoin-crawler';
import { compileStateModelBTC } from '@easylayer/bitcoin-crawler';

export const AddressBalanceModel: DeclarativeModel<any> = {
  modelId: 'address-balance',

  state() {
    return {
      balances: new Map<string, string>(),
    };
  },

  sources: {
    async vout(ctx: any) {
      const address = ctx.vout.scriptPubKey?.addresses?.[0];
      if (!address) return;
      
      return { address, amount: String(ctx.vout.value), txid: ctx.tx.txid };
    },

    async block(ctx: any) {
      const deposits = ctx.locals.vout;
      if (deposits.length > 0) {
        ctx.applyEvent('DepositReceived', ctx.block.height, { deposits });
      }
    },
  },

  reducers: {
    DepositReceived(state, e) {
      const { deposits } = e.payload;
      for (const deposit of deposits) {
        const current = BigInt(state.balances.get(deposit.address) ?? '0');
        const newBalance = current + BigInt(deposit.amount);
        state.balances.set(deposit.address, newBalance.toString());
      }
    },
  },
};

export const AddressBalance = compileStateModelBTC(AddressBalanceModel);
```

## 2. Class-Based Model (More Control)

**Example: Same Address Balance Tracker**

```typescript
import { Model } from '@easylayer/bitcoin-crawler';
import type { Block } from '@easylayer/bitcoin';

export class AddressBalanceTracker extends Model {
  static override modelId: string = 'address-balance';

  public balances = new Map<string, string>();

  public async processBlock(ctx: any & { block: Block }) {
    const { tx = [], height } = ctx.block;
    const deposits = [];

    for (const t of tx) {
      for (const o of t.vout ?? []) {
        const address = o.scriptPubKey?.addresses?.[0];
        if (!address) continue;
        deposits.push({ address, amount: String(o.value), txid: t.txid });
      }
    }

    if (deposits.length > 0) {
      this.applyEvent('DepositReceived', height, { deposits });
    }
  }

  protected onDepositReceived(e: any) {
    const { deposits } = e.payload;
    for (const deposit of deposits) {
      const current = BigInt(this.balances.get(deposit.address) ?? '0');
      const newBalance = current + BigInt(deposit.amount);
      this.balances.set(deposit.address, newBalance.toString());
    }
  }
}
```

## Accessing System Models in Your Model

You can access system models (Network, Mempool) from your model's context:

```typescript
sources: {
  async block(ctx: any) {
    // Access mempool service
    const mempool = ctx.mempoolService;
    
    // Check if transaction was in mempool
    const wasInMempool = mempool.hasTransaction('txid...');
    const isLoaded = mempool.isTransactionLoaded('txid...');
    
    // Get mempool data
    const metadata = mempool.getTransactionMetadata('txid...');
    const fullTx = mempool.getFullTransaction('txid...');
    
    // Get stats: { txids, metadata, transactions, providers }
    const stats = mempool.getStats();
  }
}
```

---

# System Models

Bitcoin Crawler includes two built-in system models:

## Network Model

Manages blockchain chain validation and state.

### Events

**BitcoinNetworkInitializedEvent**
```typescript
// Emitted when network model starts
payload: {}
```

**BitcoinNetworkBlocksAddedEvent**
```typescript
// New blocks added to validated chain
payload: {
  blocks: LightBlock[]  // Array of validated blocks
}
```

**BitcoinNetworkReorganizedEvent**
```typescript
// Blockchain reorganization occurred
payload: {
  blocks: LightBlock[]  // Blocks that were removed during reorg
}
```

**BitcoinNetworkClearedEvent**
```typescript
// Chain data cleared (for database cleaning)
payload: {}
```

### LightBlock Structure

```typescript
interface LightBlock {
  height: number;
  hash: string;
  merkleroot: string;
  previousblockhash: string;
  tx: string[]; // array of transaction IDs
}
```

## Mempool Model

Monitors unconfirmed transactions (when enabled).

### Events

**BitcoinMempoolInitializedEvent**
```typescript
// Mempool monitoring started
payload: {}
```

**BitcoinMempoolRefreshedEvent**
```typescript
// Mempool snapshot refreshed from providers
payload: {
  aggregatedMetadata: Record<string, Array<{
    txid: string;
    metadata: MempoolTxMetadata
  }>>
}
// Key: provider name, Value: array of transactions with metadata
```

**BitcoinMempoolSyncProcessedEvent**
```typescript
// Batch of transactions loaded and processed
payload: {
  loadedTransactions: Array<{
    txid: string;
    transaction: LightTransaction;
    providerName?: string;
  }>;
  batchDurations?: Record<string, number>;  // ms per provider
}
```

**BitcoinMempoolSynchronizedEvent**
```typescript
// Full sync cycle complete for current snapshot
payload: {}
```

### Accessing Mempool in Models

```typescript
sources: {
  async block(ctx: any) {
    const mempool = ctx.mempoolService;
    
    // Check transaction status
    const hasTx = mempool.hasTransaction('txid...');
    const isLoaded = mempool.isTransactionLoaded('txid...');
    
    // Get transaction data
    const metadata = mempool.getTransactionMetadata('txid...');
    const fullTx = mempool.getFullTransaction('txid...');
    
    // Get stats: { txids, metadata, transactions, providers }
    const stats = mempool.getStats();
  }
}
```

---

# Bootstrapping Your Application

Create your main file and bootstrap the crawler:

```typescript
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { AddressBalance } from './address-balance.model';

(async () => {
  const app = await bootstrap({
    Models: [AddressBalance],
  });
})();
```

## Bootstrap Options

| Option | Type | Description | Required |
|--------|------|-------------|----------|
| `Models` | `Array<ModelType>` | Custom model classes or compiled declarative models (can be empty) | ❌ |
| `QueryHandlers` | `Array<QueryHandler>` | Custom query handler classes for extending API | ❌ |

**Note:** You can bootstrap without custom models (empty Models array) to only use system models and subscribe to their events.

---

# Extending API with Custom Query Handlers

You can extend the built-in API by adding custom query handlers:

```typescript
import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';

// Define your custom query
export class GetBlockHeightQuery {
  constructor() {}
}

// Implement query handler
@QueryHandler(GetBlockHeightQuery)
export class GetBlockHeightQueryHandler implements IQueryHandler<GetBlockHeightQuery> {
  async execute() {
    return { height: 850000 };
  }
}

// Bootstrap with custom handler
bootstrap({
  Models: [],
  QueryHandlers: [GetBlockHeightQueryHandler]
});
```

**Query this custom endpoint:**

```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GetBlockHeightQuery",
    "dto": {}
  }'
```

---

# Transport Layer

Transport layer handles communication between your application and clients. All transports are configured automatically through environment variables and work under the hood.

**For easier integration, use [@easylayer/transport-sdk](https://www.npmjs.com/package/@easylayer/transport-sdk) - our client library that simplifies working with all transport types.**

## Transport Mechanisms

Each transport supports two mechanisms:

1. **Event Batches** (crawler → client): Stream of events from your models
2. **Query/Response** (client ↔ crawler): Request data and get response

## Connection Protocol

### Ping/Pong Heartbeat

All transports use ping/pong heartbeat to maintain connections:

**Server sends Ping:**
```json
{
  "action": "ping",
  "timestamp": 1234567890
}
```

**Client must respond with Pong:**
```json
{
  "action": "pong",
  "payload": {
    "password": "your-configured-password"
  },
  "timestamp": 1234567890
}
```

Password must match the one configured in transport settings. Only after valid Pong, the client is considered "online" and server will send event batches.

### Event Batch Delivery

Event batches use **at-least-once delivery** guarantee:

**Server sends batch:**
```json
{
  "action": "outbox.stream.batch",
  "correlationId": "batch-uuid",
  "payload": {
    "events": [
      {
        "modelName": "address-balance",
        "eventType": "DepositReceived",
        "eventVersion": 1,
        "requestId": "evt-uuid",
        "blockHeight": 850001,
        "payload": "{\"deposits\":[...]}",
        "timestamp": 1234567890
      }
    ]
  },
  "timestamp": 1234567890
}
```

**Client MUST send ACK:**
```json
{
  "action": "outbox.stream.ack",
  "correlationId": "same-as-batch-correlationId",
  "payload": {
    "ok": true,
    "okIndices": [0, 1, 2]  // indices of successfully processed events
  }
}
```

**Important:**
- ACK is mandatory! Without ACK, server will retry sending the batch
- Use `correlationId` from batch in your ACK
- `okIndices` indicates which events you successfully processed
- At-least-once means you might receive same events multiple times - handle idempotently

---

## HTTP Transport

### Event Batches (Webhook)

Configure webhook to receive event batches:

```bash
# .env
HTTP_HOST=0.0.0.0
HTTP_PORT=3000
HTTP_WEBHOOK_URL=https://your-server.com/events
HTTP_WEBHOOK_PING_URL=https://your-server.com/ping
HTTP_WEBHOOK_TOKEN=optional-auth-token
HTTP_WEBHOOK_PASSWORD=ping-pong-password
```

**How it works:**

1. **Crawler sends Ping** to `HTTP_WEBHOOK_PING_URL`:
   ```json
   POST https://your-server.com/ping
   {
     "action": "ping",
     "timestamp": 1234567890
   }
   ```

2. **Your server responds with Pong:**
   ```json
   {
     "action": "pong",
     "payload": { "password": "ping-pong-password" },
     "timestamp": 1234567890
   }
   ```

3. **After valid Pong, crawler sends event batch** to `HTTP_WEBHOOK_URL`:
   ```json
   POST https://your-server.com/events
   X-Transport-Token: optional-auth-token
   
   {
     "action": "outbox.stream.batch",
     "correlationId": "batch-uuid",
     "payload": { "events": [...] }
   }
   ```

4. **Your server must respond with ACK:**
   ```json
   {
     "action": "outbox.stream.ack",
     "correlationId": "batch-uuid",
     "payload": { "ok": true, "okIndices": [0, 1, 2] }
   }
   ```

### Query/Response

Crawler automatically starts HTTP server with `/query` endpoint:

```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GetModelsQuery",
    "dto": {
      "modelIds": ["address-balance"]
    }
  }'
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "aggregateId": "address-balance",
    "state": { /* model state */ }
  }
}
```

---

## WebSocket Transport

Client connects to WebSocket and receives both event batches and can send queries on same connection.

```bash
# .env
WS_HOST=0.0.0.0
WS_PORT=3001
WS_PATH=/
WS_PASSWORD=ping-pong-password
```

**Client example:**

```typescript
import { WebSocket } from 'ws';

const ws = new WebSocket('ws://localhost:3001');

ws.on('open', () => {
  console.log('Connected');
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  
  // Handle Ping
  if (message.action === 'ping') {
    ws.send(JSON.stringify({
      action: 'pong',
      payload: { password: 'ping-pong-password' },
      timestamp: Date.now()
    }));
    return;
  }
  
  // Handle event batch
  if (message.action === 'outbox.stream.batch') {
    const events = message.payload.events;
    
    // Process events...
    console.log(`Received ${events.length} events`);
    
    // Send ACK
    ws.send(JSON.stringify({
      action: 'outbox.stream.ack',
      correlationId: message.correlationId,
      payload: { ok: true, okIndices: events.map((_, i) => i) }
    }));
    return;
  }
  
  // Handle query response
  if (message.action === 'query.response') {
    console.log('Query result:', message.payload.data);
  }
});

// Send query
ws.send(JSON.stringify({
  action: 'query.request',
  correlationId: 'query-1',
  payload: {
    name: 'GetModelsQuery',
    dto: { modelIds: ['address-balance'] }
  }
}));
```

---

## IPC Transport

IPC transport works between parent and child Node.js processes. Behavior depends on where bootstrap is called.

### Client in Parent, Crawler in Child

Bootstrap runs in child process. Parent process acts as client.

**Child process (crawler.ts):**
```typescript
import { bootstrap } from '@easylayer/bitcoin-crawler';

bootstrap({ Models: [] });  // Crawler runs here
```

**Parent process (client):**
```typescript
import { fork } from 'child_process';
import { Client } from '@easylayer/transport-sdk';

// Fork child process with IPC channel
const child = fork('./crawler.js', [], {
  stdio: ['pipe', 'pipe', 'pipe', 'ipc']
});

// Create client
const client = new Client({
  transport: { type: 'ipc-parent', options: { child } }
});

// Subscribe to events
client.subscribe('DepositReceived', (event) => {
  console.log('Deposit:', event);
});

// Send query
const result = await client.query('GetModelsQuery', {
  modelIds: ['address-balance']
});
```

### Client in Child, Crawler in Parent

Bootstrap runs in parent process. Child process acts as client.

**Parent process (crawler.ts):**
```typescript
import { bootstrap } from '@easylayer/bitcoin-crawler';

bootstrap({ Models: [] });  // Crawler runs here
```

**Child process (client):**
```typescript
import { Client } from '@easylayer/transport-sdk';

// Create client
const client = new Client({
  transport: { type: 'ipc-child', options: {} }
});

// Subscribe to events
client.subscribe('DepositReceived', (event) => {
  console.log('Deposit:', event);
});

// Send query
const result = await client.query('GetModelsQuery', {
  modelIds: ['address-balance']
});
```

### Complete Example with Express Server

**Parent process serves HTTP API, child runs crawler:**

```typescript
import { resolve } from 'path';
import { fork } from 'child_process';
import express from 'express';
import { Client } from '@easylayer/transport-sdk';

// Fork crawler as child
const child = fork(resolve(process.cwd(), 'src/crawler.js'), [], {
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
});

// Create IPC client
const client = new Client({
  transport: { type: 'ipc-parent', options: { child } }
});

// Subscribe to events
client.subscribe('DepositReceived', (event) => {
  console.log('New deposit:', event);
});

// Express server
const app = express();
app.use(express.json());

app.get('/balance', async (req, res) => {
  const addresses = (req.query.addresses as string).split(',');
  const data = await client.query('GetBalanceQuery', { addresses });
  res.json(data);
});

app.get('/model', async (req, res) => {
  const modelId = req.query.modelId as string;
  const data = await client.query('GetModelsQuery', {
    modelIds: [modelId]
  });
  res.json(data);
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

---

## Electron Transport

<!-- TODO: Add Electron transport configuration and examples -->

## Browser Transport

<!-- TODO: Add Browser transport configuration and examples -->

**Note:** In browser and Electron renderer, only event streaming works. Query server doesn't start - queries must go to main application or server.

---

# Event Delivery & Broker

## At-Least-Once Delivery

Bitcoin Crawler uses **at-least-once delivery** guarantee for event batches:

**Guarantees:**
- Every event batch will be delivered at least once
- Events may be delivered multiple times
- Order is preserved within batches
- Events won't be lost

**Your responsibility:**
- Handle events idempotently (same event can arrive multiple times)
- Always send ACK after processing
- Use `correlationId` to match ACK with batch

## Batch Size

Event batches are automatically sized based on:
- Number of events generated
- Total payload size
- Transport message size limits

**Configuration:**
```bash
HTTP_MAX_MESSAGE_SIZE=1048576  # 1MB default
WS_MAX_MESSAGE_SIZE=1048576
IPC_MAX_MESSAGE_SIZE=1048576
```

If single batch exceeds limit, it will be split into multiple batches.

## Retry Logic

If ACK not received within timeout:
- Batch is retried
- Exponential backoff between retries
- Connection health checked via ping/pong

**Best practices:**
- Process events quickly
- Send ACK immediately after processing
- Don't block on slow operations before ACK
- Store events for async processing if needed

---

<!-- CONFIG-START -->
## Configuration Reference

### AppConfig

| Property | Type | Description | Default | Required |
|---|---|---|---|:---:|
| `NODE_ENV` | string | Node environment | `"development"` | ✅ |
| `LOG_LEVEL` | string | Minimum log level to output. Ignored if DEBUG=1. Defaults to "info" when not set. |  |  |
| `LOGS_FILE` | string | If set, structured logs (NDJSON) are appended to this file. When unset, logs go to stdout. |  |  |
| `DEBUG` | string | When set to "1", forces debug-level logging regardless of LOG_LEVEL (except in test). |  |  |

### BlocksQueueConfig

| Property | Type | Description | Default | Required |
|---|---|---|---|:---:|
| `BLOCKS_QUEUE_LOADER_STRATEGY_NAME` | string | Loader strategy name for the Bitcoin blocks queue. | `"rpc"` | ✅ |

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
| `EVENTSTORE_DB_NAME` | string | For SQLite: folder path where the database file will be created; For Postgres: name of the database to connect to. | `"resolve(process.cwd(), 'eventstore"` | ✅ |
| `EVENTSTORE_DB_TYPE` | string | Type of database for the eventstore. | `"sqlite"` | ✅ |
| `EVENTSTORE_DB_SYNCHRONIZE` | boolean | Automatic synchronization that creates or updates tables and columns. Use with caution. | `true` | ✅ |
| `EVENTSTORE_DB_HOST` | string | Host for the eventstore database connection. |  |  |
| `EVENTSTORE_DB_PORT` | number | Port for the eventstore database connection. |  |  |
| `EVENTSTORE_DB_USERNAME` | string | Username for the eventstore database connection. |  |  |
| `EVENTSTORE_DB_PASSWORD` | string | Password for the eventstore database connection. |  |  |

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

### TransportConfig

| Property | Type | Description | Default | Required |
|---|---|---|---|:---:|
| `TRANSPORT_HTTP_HOST` | string | HTTP server host (if omitted, HTTP is disabled) |  |  |
| `TRANSPORT_HTTP_PORT` | number | HTTP server port. If undefined or 0, HTTP transport is disabled. |  |  |
| `TRANSPORT_HTTP_MAX_MESSAGE_SIZE` | number | Maximum HTTP message/frame size in bytes. If undefined, use app default. |  |  |
| `TRANSPORT_HTTP_SSL_ENABLED` | boolean | Enable TLS for HTTP server. If undefined, treated as disabled. |  |  |
| `TRANSPORT_HTTP_SSL_KEY_PATH` | string | Path to HTTP TLS private key (PEM) |  |  |
| `TRANSPORT_HTTP_SSL_CERT_PATH` | string | Path to HTTP TLS certificate (PEM) |  |  |
| `TRANSPORT_HTTP_SSL_CA_PATH` | string | Path to HTTP TLS CA bundle (PEM) |  |  |
| `TRANSPORT_HTTP_WEBHOOK_URL` | string | HTTP webhook URL for outbound event batches |  |  |
| `TRANSPORT_HTTP_WEBHOOK_PING_URL` | string | Optional healthcheck/ping URL for webhook |  |  |
| `TRANSPORT_HTTP_WEBHOOK_TOKEN` | string | Optional bearer/shared token for webhook auth |  |  |
| `TRANSPORT_WS_HOST` | string | WebSocket server host (if omitted, WS is disabled) |  |  |
| `TRANSPORT_WS_PATH` | string | WebSocket server path (e.g., "/socket") |  |  |
| `TRANSPORT_WS_PORT` | number | WebSocket server port. If undefined or 0, WS transport is disabled. |  |  |
| `TRANSPORT_WS_MAX_MESSAGE_SIZE` | number | Maximum WebSocket message/frame size in bytes. If undefined, use app default. |  |  |
| `TRANSPORT_WS_CORS_ORIGIN` | string | CORS origin for WS server (string value). If undefined, CORS is not applied. |  |  |
| `TRANSPORT_WS_CORS_CREDENTIALS` | boolean | CORS credentials for WS server |  |  |
| `TRANSPORT_WS_SSL_ENABLED` | boolean | Enable TLS for WebSocket server. If undefined, treated as disabled. |  |  |
| `TRANSPORT_WS_SSL_KEY_PATH` | string | Path to WS TLS private key (PEM) |  |  |
| `TRANSPORT_WS_SSL_CERT_PATH` | string | Path to WS TLS certificate (PEM) |  |  |
| `TRANSPORT_WS_SSL_CA_PATH` | string | Path to WS TLS CA bundle (PEM) |  |  |
| `TRANSPORT_WS_TRANSPORTS` | array | Enabled WS transport modes (comma-separated). If undefined, library defaults apply. |  |  |
| `TRANSPORT_IPC_MAX_MESSAGE_SIZE` | number | Maximum IPC message size in bytes. If undefined, use app default. |  |  |
| `TRANSPORT_HEARTBEAT_TIMEOUT` | number | Heartbeat timeout in milliseconds for streaming transports. If undefined, use app default. |  |  |
| `TRANSPORT_CONNECTION_TIMEOUT` | number | Connection timeout in milliseconds. If undefined, use app default. |  |  |
| `TRANSPORT_OUTBOX_ENABLE` | string | Enable outbox-driven transport publishing: "1" or "0". If undefined, feature is off by default. |  |  |
| `TRANSPORT_OUTBOX_KIND` | string | Outbox transport kind for publishing batches |  |  |
| `TRANSPORT_IPC_TYPE` | string | IPC transport kind for enable transport |  |  |

<!-- CONFIG-END -->

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

# Examples

Complete working examples are available in the [GitHub repository](https://github.com/easylayer/easylayer/tree/main/packages/bitcoin-crawler/examples).

---

# Best Practices

## Model Design

1. **Keep models focused**: One responsibility per model
2. **Filter early**: Don't process irrelevant data
3. **Optimize events**: Small events = faster processing
4. **Handle idempotency**: Events can arrive multiple times

## Event Processing

1. **Idempotent handlers**: Same event should produce same result
2. **Quick ACK**: Send ACK immediately after processing
3. **Async work**: Don't block before ACK - store and process async if needed
4. **Error handling**: Log errors but send ACK to avoid retries

## Deployment

1. **Start small**: Test with recent blocks before full historical sync
2. **Monitor resources**: Track CPU, memory, disk usage
3. **Use PostgreSQL**: For production and large datasets
4. **Backup Event Store**: Regular backups of your database
5. **Multiple instances**: Run separate indexers for different models

## Security

1. **Secure node access**: Use authentication if available
2. **Environment variables**: Never commit sensitive data to git
3. **Transport passwords**: Use strong passwords for ping/pong
4. **Database access**: Restrict database user permissions
5. **Firewall rules**: Restrict access to transport ports

---

# Support

## Community Support

- **GitHub Discussions:** https://github.com/easylayer/easylayer/discussions
- **GitHub Issues:** https://github.com/easylayer/easylayer/issues
- **Documentation:** https://easylayer.io/docs

## Enterprise Support

For priority support, custom solutions, or consulting:
- Contact: https://easylayer.io/enterprise

---

# License

Bitcoin Crawler is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).

See [LICENSE](https://github.com/easylayer/easylayer/blob/main/LICENSE) for details.