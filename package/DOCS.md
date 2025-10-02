# EasyLayer Bitcoin Crawler Documentation

<b>Bitcoin Crawler</b> is a self-hosted application that enables monitoring of the blockchain state both historically and in real-time

---

<!-- KEY-FEATURES-START -->

## Overview

Bitcoin Crawler is a powerful self-hosted application designed for monitoring and analyzing the Bitcoin blockchain. It provides developers with a flexible framework to track blockchain state both historically and in real-time, enabling them to build custom blockchain analytics and monitoring solutions.

The application is built on modern architectural patterns including CQRS (Command Query Responsibility Segregation) and Event Sourcing, ensuring reliable and consistent data processing. It offers multiple transport options (RPC, WebSocket, IPC) for accessing blockchain data and supports both SQL-like for event storage.

## Key Features

* **Self-Hosted & Private**: Deploy entirely on your own infrastructure — your data never leaves your servers.
* **Custom State Models**: Define only the states you need in custom model files for smaller datasets, faster queries, and lower storage overhead.
* **Live & Historical Streams**: Sync the entire chain history once and maintain a continuous real-time feed through the same endpoint for dashboards or alerts.
* **Reorg-Proof Consistency**: Automatic fork handler rolls back and replays data for chain reorganizations of any depth — no manual intervention required.
* **Mempool Monitoring**: Track and filter unconfirmed transactions in real time to power mempool analytics and alerting.
* **2 RPC Calls per Block**: Fetch full block data with just two RPC requests to minimize node load and reduce operational cost.
* **Instant Block Snapshots**: Request the exact state of any model at a specific block height with a single call.
* **Event-Based Processing**: Create and handle custom events to track blockchain state changes with full auditability.
* **Multiple Transport Options**: Access data over HTTP RPC, WebSocket, or IPC, with built‑in heartbeat and message‑size controls.
* **Database Flexibility**: Choose between managed SQLite for quick setups or PostgreSQL for production-ready performance.
* **Flexible Node Connectivity**: Works seamlessly with a self-hosted Bitcoin node or provider services like QuickNode.

<!-- KEY-FEATURES-END -->

<!-- PERFORMANCE-START -->
## Performance (TODO)

Bitcoin Crawler is engineered for high-speed operation, but actual performance is primarily influenced by two factors: network latency when fetching blocks from the blockchain and the efficiency of inserting large datasets into database, depending on your model structure.

<!-- PERFORMANCE-END -->

<!-- SETUP-START -->
# Setup Guide

This guide explains how to install, configure, and bootstrap your application using the EasyLayer Bitcoin Crawler framework.

---

## Prerequisites

* Node.js v17 or higher
* A running Bitcoin node (self-hosted or via provider URL)
* Environment variables configured in a `.env` file at project root

---

## Installation

Install the package via npm or yarn:

```bash
# Using npm
npm install @easylayer/bitcoin-crawler

# Using yarn
yarn add @easylayer/bitcoin-crawler
```

## Bootstrapping the Application

The [@easylayer/bitcoin-crawler](https://www.npmjs.com/@easylayer.io/bitcoin-crawler) package exports a `bootstrap` function that initializes the crawler. Here's a basic setup:

```ts title="main.ts"
import 'reflect-metadata';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import CustomModel from './model';

(async () => {
  const app = await bootstrap({ Models: [CustomModel]});
})();
```

### Bootstrap Options

| Option          | Type                                                                        | Description                                                |
| --------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `Models`        | `Array<ModelType>`                                                          | Custom model classes extending `Model`                     |
| `QueryHandlers` | `Array<new(...args) => IQueryHandler>`                                      | Classes implementing query handling logic                  |
| `EventHandlers` | `Array<new(...args) => IEventHandler>`                                      | Classes implementing event handling logic                  |
| `Providers`     | `Array<Provider>`                                                           | Additional custom providers (services, factories, etc.)      |
---

*For detailed transport configuration and message interfaces, see the **Transport API Reference** section.*

<!-- SETUP-END -->

<!-- TRANSPORT-API-REFERENCE-START -->
# Transport API Reference

This document describes all supported transport protocols, their endpoints, configurable options, and message interfaces.

---

## Common Settings

* **SSL/TLS**: Supported for both HTTP and WebSocket. Enable via `ssl.enabled`, `ssl.cert`, and `ssl.key` in transport configurations.
* **Message Size Limits**: Configurable per transport using the `maxMessageSize` option.
* **Heartbeat (ping/pong)**: Available for WebSocket and IPC with adjustable `heartbeatTimeout` settings.

---

## 1. HTTP RPC (Queries Only)

### 1.1 Endpoints

| Method | Path      | Description           |
| ------ | --------- | --------------------- |
| GET    | `/health` | Health check endpoint |
| POST   | `/`       | Receives RPC requests |

**Example URL**: `https://{host}:{port}/` or `http://{host}:{port}/` if SSL is disabled.

### 1.2 Behavior

* Accepts only requests with `action: "query"`.
* Validates incoming message format and size against configured limits.
* **Responses:**

  * **Success:** `action: "queryResponse"` with the same `requestId`.
  * **Error:** `action: "error"` or HTTP 4xx/5xx status codes for transport-level failures.

---

## 2. HTTP Streaming (NDJSON)

### 2.1 Endpoint

| Method | Path      | Description                                 |
| ------ | --------- | ------------------------------------------- |
| POST   | `/stream` | Receives streaming queries (chunked NDJSON) |

* **Content-Type**: `application/x-ndjson`

### 2.2 Behavior

* Accepts only requests with `action: "streamQuery"`.
* Returns `Transfer-Encoding: chunked` with newline-delimited JSON objects.
* Sends a `streamEnd` message at the end of the stream.
* Streams individual error objects as separate JSON lines.

---

## 3. WebSocket

### 3.1 Endpoint and Path

* **URL Template**: `ws://{host}:{wsPort}{path}` or `wss://{host}:{wsPort}{path}` when SSL is enabled.
* **Path Configuration**: Controlled by the `wsOptions.path` setting (default: `/events`).

### 3.2 Behavior

* All messages are emitted and received on a single `message` event containing a JSON payload.
* Connection health is maintained via periodic `ping` (server → client) and `pong` (client → server) messages.
* Enforces maximum message size via the `maxMessageSize` configuration.

---

## 4. IPC (Child Process)

### 4.1 Operation Mode

* Available only when the application runs as a Node.js child process using `fork()`.
* Uses `process.send()` and `process.on('message')` for bidirectional messaging.
* Supports `ping`/`pong` heartbeat with a configurable `heartbeatTimeout`.
* Validates message sizes against IPC-specific limits.

---

## 5. Message Interfaces

```ts
export interface BaseMessage<A extends string = string, P = any> {
  /** Optional request identifier */
  requestId?: string;
  /** Action type */
  action: A;
  /** Message payload */
  payload?: P;
  /** Timestamp of the message */
  timestamp?: number;
}

export type IncomingActions = 'query' | 'streamQuery' | 'ping' | 'pong';

export type OutgoingActions =
  | 'queryResponse'
  | 'streamResponse'
  | 'streamEnd'
  | 'event'
  | 'eventsBatch'
  | 'error'
  | 'ping'
  | 'pong';

export interface IncomingMessage<A extends IncomingActions = IncomingActions, P = any>
  extends BaseMessage<A, P> {}

export interface OutgoingMessage<A extends OutgoingActions = OutgoingActions, P = any>
  extends BaseMessage<A, P> {}

export interface BasePayload<DTO = any> {
  /** Query constructor name */
  constructorName: string;
  /** DTO object for the query */
  dto: DTO;
}
```

*Detailed DTO examples and query documentation are available in the **Query API Reference** section.*

---
<!-- TRANSPORT-API-REFERENCE-END -->

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

### Mempool Queries

#### CheckMempoolTransactionQuery

Checks if a specific transaction exists in mempool and retrieves its status

**Parameters:**

| Parameter | Type | Required | Description | Default | Example |
|-----------|------|----------|-------------|---------|----------|
| `txid` | string | ✅ | Transaction ID to check in mempool |  | `"abc123def456789012345678901234567890123456789012345678901234567890"` |

**Example Request:**

```json
{
  "requestId": "uuid-1",
  "action": "query",
  "payload": {
    "constructorName": "CheckMempoolTransactionQuery",
    "dto": {
      "txid": "abc123def456789012345678901234567890123456789012345678901234567890"
    }
  }
}
```

**Example Response:**

```json
{
  "txid": "abc123def456789012345678901234567890123456789012345678901234567890",
  "exists": true,
  "isLoaded": true,
  "wasAttempted": true,
  "loadInfo": {
    "timestamp": 1672531200000,
    "feeRate": 100.5
  }
}
```

---

#### GetMempoolStatsQuery

Retrieves mempool statistics and synchronization status

**Example Request:**

```json
{
  "requestId": "uuid-2",
  "action": "query",
  "payload": {
    "constructorName": "GetMempoolStatsQuery",
    "dto": {}
  }
}
```

**Example Response:**

```json
{
  "totalTxids": 50000,
  "loadedTransactions": 45000,
  "isSynchronized": true,
  "fullSyncThreshold": 10000,
  "currentBatchSize": 150,
  "syncTimingInfo": {
    "previous": 1200,
    "last": 950,
    "ratio": 0.79
  }
}
```

---

#### GetMempoolTransactionsQuery

Retrieves mempool transactions with optional streaming support for large datasets

🔄 **Supports Streaming**

**Parameters:**

| Parameter | Type | Required | Description | Default | Example |
|-----------|------|----------|-------------|---------|----------|
| `onlyLoaded` | boolean |  | Return only fully loaded transactions (excludes null placeholders) | `false` | `true` |
| `streaming` | boolean |  | Enable streaming response for large datasets | `false` | `true` |
| `batchSize` | number |  | Number of transactions per batch when streaming | `100` | `100` |

**Example Request:**

```json
{
  "requestId": "uuid-3",
  "action": "streamQuery",
  "payload": {
    "constructorName": "GetMempoolTransactionsQuery",
    "dto": {
      "streaming": true,
      "onlyLoaded": true,
      "batchSize": 100
    }
  }
}
```

**Example Response:**

```json
{
  "type": "batch",
  "data": {
    "batch": [
      {
        "txid": "abc123...",
        "transaction": {
          "vsize": 250,
          "fees": {
            "base": 25000
          },
          "time": 1672531200
        }
      }
    ],
    "batchIndex": 0,
    "hasMore": true
  }
}
```

---

#### GetMempoolTxidsQuery

Retrieves transaction IDs currently tracked in mempool with optional load information

🔄 **Supports Streaming**

**Parameters:**

| Parameter | Type | Required | Description | Default | Example |
|-----------|------|----------|-------------|---------|----------|
| `streaming` | boolean |  | Enable streaming response for large datasets | `false` | `true` |
| `batchSize` | number |  | Number of transaction IDs per batch when streaming | `1000` | `1000` |
| `includeLoadInfo` | boolean |  | Include load attempt information (timestamp and fee rate) | `false` | `true` |

**Example Request:**

```json
{
  "requestId": "uuid-4",
  "action": "streamQuery",
  "payload": {
    "constructorName": "GetMempoolTxidsQuery",
    "dto": {
      "streaming": true,
      "batchSize": 1000,
      "includeLoadInfo": true
    }
  }
}
```

**Example Response:**

```json
{
  "type": "currentTxids",
  "data": {
    "batch": [
      "abc123def456...",
      "def789abc123...",
      "fed321cba987..."
    ],
    "batchIndex": 0,
    "hasMore": true
  }
}
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

<!-- QUERY-API-END -->

<!-- CONFIG-START -->
## Configuration Reference

### undefined

| Property | Type | Description | Default | Required |
|---|---|---|---|:---:|
| `NODE_ENV` | string | Node environment | `"development"` | ✅ |
| `HTTP_HOST` | string | Http Server host |  |  |
| `HTTP_PORT` | number | Http Server port (0 or undefined to disable) |  |  |
| `HTTP_SSL_ENABLED` | boolean | Enable SSL for HTTP server | `false` |  |
| `HTTP_SSL_KEY_PATH` | string | Path to SSL private key file for HTTP server |  |  |
| `HTTP_SSL_CERT_PATH` | string | Path to SSL certificate file for HTTP server |  |  |
| `HTTP_SSL_CA_PATH` | string | Path to SSL CA file for HTTP server |  |  |
| `WS_HOST` | string | WebSocket server host | `"0.0.0.0"` |  |
| `WS_PATH` | string | WebSocket Server path | `"/"` |  |
| `WS_PORT` | number | WebSocket Server port (0 or undefined to disable) |  |  |
| `HTTP_MAX_MESSAGE_SIZE` | number | Maximum message size for HTTP transport in bytes | `1048576` | ✅ |
| `WS_MAX_MESSAGE_SIZE` | number | Maximum message size for WebSocket transport in bytes | `1048576` | ✅ |
| `IPC_MAX_MESSAGE_SIZE` | number | Maximum message size for IPC transport in bytes | `1048576` | ✅ |
| `HEARTBEAT_TIMEOUT` | number | Heartbeat timeout in milliseconds | `3000` | ✅ |
| `CONNECTION_TIMEOUT` | number | Connection timeout in milliseconds | `2000` | ✅ |
| `WS_CORS_ORIGIN` | string | CORS origin for WebSocket | `"*"` |  |
| `WS_CORS_CREDENTIALS` | boolean | CORS credentials for WebSocket | `false` |  |
| `WS_SSL_ENABLED` | boolean | Enable SSL for WebSocket | `false` |  |
| `WS_SSL_KEY_PATH` | string | Path to SSL private key file for WebSocket |  |  |
| `WS_SSL_CERT_PATH` | string | Path to SSL certificate file for WebSocket |  |  |
| `WS_SSL_CA_PATH` | string | Path to SSL CA file for WebSocket |  |  |
| `WS_TRANSPORTS` | array | WebSocket transports (comma-separated: websocket,polling) | `"websocket,polling"` |  |

### undefined

| Property | Type | Description | Default | Required |
|---|---|---|---|:---:|
| `BLOCKS_QUEUE_LOADER_STRATEGY_NAME` | string | Loader strategy name for the Bitcoin blocks queue. | `"pull"` | ✅ |

### undefined

| Property | Type | Description | Default | Required |
|---|---|---|---|:---:|
| `MAX_BLOCK_HEIGHT` | number | Maximum block height to be processed. Defaults to infinity. | `9007199254740991` | ✅ |
| `START_BLOCK_HEIGHT` | number | The block height from which processing begins. If not set, only listen to new blocks. |  |  |
| `NETWORK_TYPE` | string | Bitcoin network type (mainnet, testnet, regtest, signet) |  | ✅ |
| `NETWORK_NATIVE_CURRENCY_SYMBOL` | string | Symbol of the native currency (BTC, LTC, DOGE, etc.) |  | ✅ |
| `NETWORK_NATIVE_CURRENCY_DECIMALS` | number | Decimals of the native currency |  | ✅ |
| `NETWORK_TARGET_BLOCK_TIME` | number | Target block time in seconds (600=Bitcoin, 150=Litecoin, 60=Dogecoin) |  | ✅ |
| `NETWORK_HAS_SEGWIT` | boolean | Whether the network supports SegWit |  | ✅ |
| `NETWORK_HAS_TAPROOT` | boolean | Whether the network supports Taproot |  | ✅ |
| `NETWORK_HAS_RBF` | boolean | Whether the network supports Replace-by-Fee |  | ✅ |
| `NETWORK_HAS_CSV` | boolean | Whether the network supports CheckSequenceVerify |  | ✅ |
| `NETWORK_HAS_CLTV` | boolean | Whether the network supports CheckLockTimeVerify |  | ✅ |
| `NETWORK_MAX_BLOCK_SIZE` | number | Maximum block size in bytes (1MB for Bitcoin, 32MB for BCH) |  | ✅ |
| `NETWORK_MAX_BLOCK_WEIGHT` | number | Maximum block weight in weight units |  | ✅ |
| `NETWORK_DIFFICULTY_ADJUSTMENT_INTERVAL` | number | Difficulty adjustment interval in blocks |  | ✅ |

### undefined

| Property | Type | Description | Default | Required |
|---|---|---|---|:---:|
| `EVENTSTORE_DB_NAME` | string | For SQLite: folder path where the database file will be created; For Postgres: name of the database to connect to. | `"resolve(process.cwd(), 'eventstore"` | ✅ |
| `EVENTSTORE_DB_TYPE` | string | Type of database for the eventstore. | `"sqlite"` | ✅ |
| `EVENTSTORE_DB_SYNCHRONIZE` | boolean | Automatic synchronization that creates or updates tables and columns. Use with caution. | `true` | ✅ |
| `EVENTSTORE_DB_HOST` | string | Host for the eventstore database connection. |  |  |
| `EVENTSTORE_DB_PORT` | number | Port for the eventstore database connection. |  |  |
| `EVENTSTORE_DB_USERNAME` | string | Username for the eventstore database connection. |  |  |
| `EVENTSTORE_DB_PASSWORD` | string | Password for the eventstore database connection. |  |  |

### undefined

| Property | Type | Description | Default | Required |
|---|---|---|---|:---:|
| `MEMPOOL_MONITORING_ENABLED` | boolean | Enable Bitcoin mempool monitoring and caching |  | ✅ |
| `MEMPOOL_FULL_SYNC_THRESHOLD` | number | Threshold for using getRawMempool(true) strategy in transaction count |  | ✅ |
| `MEMPOOL_MIN_FEE_RATE` | number | Minimum fee rate for caching transactions in sat/vB |  | ✅ |

### undefined

| Property | Type | Description | Default | Required |
|---|---|---|---|:---:|
| `NETWORK_PROVIDER_NODE_HTTP_URL` | string | HTTP URL of the Bitcoin-like network provider node |  | ✅ |
| `NETWORK_PROVIDER_TYPE` | string | Type of the network provider (selfnode, quicknode, etc.) |  | ✅ |
| `NETWORK_PROVIDER_REQUEST_TIMEOUT` | number | Request timeout in milliseconds |  | ✅ |
| `NETWORK_PROVIDER_RATE_LIMIT_MAX_CONCURRENT_REQUESTS` | number | Maximum concurrent requests |  | ✅ |
| `NETWORK_PROVIDER_RATE_LIMIT_MAX_BATCH_SIZE` | number | Maximum batch size for parallel requests |  | ✅ |
| `NETWORK_PROVIDER_RATE_LIMIT_REQUEST_DELAY_MS` | number | Delay between batches in milliseconds |  | ✅ |

<!-- CONFIG-END -->
