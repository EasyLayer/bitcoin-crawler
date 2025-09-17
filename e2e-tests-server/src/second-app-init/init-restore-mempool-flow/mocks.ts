export interface MempoolRecord {
  version: number;
  requestId: string;
  type: string;
  payload: Record<string, any>;
  blockHeight: number | null;
  isCompressed?: number;
  timestamp: number;
}

export const mempoolTableSQL = `
CREATE TABLE IF NOT EXISTS mempool (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  version       INTEGER        DEFAULT 0,
  requestId     VARCHAR        NOT NULL,
  type          VARCHAR        NOT NULL,
  payload       BLOB           NOT NULL,
  blockHeight   INTEGER        DEFAULT NULL,
  isCompressed  BOOLEAN        DEFAULT 0,
  timestamp     BIGINT         NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS UQ_mempool_v_reqid ON mempool (version, requestId);
CREATE INDEX IF NOT EXISTS IDX_mempool_blockh ON mempool (blockHeight);
`;

export const mockMempool: MempoolRecord[] = [
  {
    version: 1,
    requestId: 'req-1',
    type: 'BitcoinMempoolInitializedEvent',
    payload: {
      allTxidsFromNode: ['txid_a', 'txid_b'],
      isSynchronized: false,
      providerTxidMapping: { txid_a: [0], txid_b: [1] },
      aggregatedMetadata: {
        txid_a: { fee: 1000, vsize: 200 },
        txid_b: { fee: 800, vsize: 250 },
      },
    },
    blockHeight: 1504846,
    isCompressed: 0,
    timestamp: Math.trunc(Date.now() * 1000),
  },
  {
    version: 2,
    requestId: 'req-2',
    type: 'BitcoinMempoolSynchronizedEvent',
    payload: { isSynchronized: true },
    blockHeight: 1504846,
    isCompressed: 0,
    timestamp: Math.trunc(Date.now() * 1000),
  },
];
