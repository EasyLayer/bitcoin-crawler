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

export const seedMempoolEvent = {
  version: 1,
  requestId: 'req-1',
  type: 'BitcoinMempoolBlockBatchProcessedEvent',
  payload: {},
  blockHeight: 2,
  isCompressed: 0,
  timestamp: Math.trunc(Date.now() * 1000),
};
