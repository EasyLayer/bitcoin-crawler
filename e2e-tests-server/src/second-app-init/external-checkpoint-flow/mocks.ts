export interface NetworkRecord {
  version: number;
  requestId: string;
  type: string;
  payload: Record<string, any>;
  blockHeight: number | null;
  isCompressed?: number;
  timestamp: number;
}

export const networkTableSQL = `
CREATE TABLE IF NOT EXISTS network (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  version       INTEGER        DEFAULT 0,
  requestId     VARCHAR        NOT NULL,
  type          VARCHAR        NOT NULL,
  payload       BLOB           NOT NULL,
  blockHeight   INTEGER        DEFAULT NULL,
  isCompressed  BOOLEAN        DEFAULT 0,
  timestamp     BIGINT         NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS UQ_network_v_reqid ON network (version, requestId);
CREATE INDEX IF NOT EXISTS IDX_network_blockh ON network (blockHeight);
`;

const nowMicros = () => Math.trunc(Date.now() * 1000);

function block(height: number, previousblockhash: string): Record<string, any> {
  const hash = `test-block-hash-${height}`;
  return {
    height,
    hash,
    merkleroot: `test-merkle-root-${height}`,
    previousblockhash,
    tx: [`test-txid-${height}`],
  };
}

const block1 = block(1, 'test-block-hash-0');
const block2 = block(2, block1.hash);
const block3 = block(3, block2.hash);

export const checkpointRollbackNetworkEvents: NetworkRecord[] = [
  {
    version: 1,
    requestId: 'checkpoint-req-1',
    type: 'BitcoinNetworkInitializedEvent',
    payload: {
      lastIndexedHeight: 0,
      nextBlockToProcess: 1,
      currentNetworkHeight: 4,
    },
    blockHeight: 0,
    isCompressed: 0,
    timestamp: nowMicros(),
  },
  {
    version: 2,
    requestId: 'checkpoint-req-2',
    type: 'BitcoinNetworkBlocksAddedEvent',
    payload: { blocks: [block1] },
    blockHeight: 1,
    isCompressed: 0,
    timestamp: nowMicros(),
  },
  {
    version: 3,
    requestId: 'checkpoint-req-3',
    type: 'BitcoinNetworkBlocksAddedEvent',
    payload: { blocks: [block2] },
    blockHeight: 2,
    isCompressed: 0,
    timestamp: nowMicros(),
  },
  {
    version: 4,
    requestId: 'checkpoint-req-4',
    type: 'BitcoinNetworkBlocksAddedEvent',
    payload: { blocks: [block3] },
    blockHeight: 3,
    isCompressed: 0,
    timestamp: nowMicros(),
  },
];

export const checkpointAheadNetworkEvents: NetworkRecord[] = [
  {
    version: 1,
    requestId: 'ahead-req-1',
    type: 'BitcoinNetworkInitializedEvent',
    payload: {
      lastIndexedHeight: 0,
      nextBlockToProcess: 1,
      currentNetworkHeight: 4,
    },
    blockHeight: 0,
    isCompressed: 0,
    timestamp: nowMicros(),
  },
];
