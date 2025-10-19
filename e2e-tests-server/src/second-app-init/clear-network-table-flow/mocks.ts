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

export const seedNetworkEvent = {
  version: 1,
  requestId: 'req-1',
  type: 'BitcoinNetworkBlocksAddedEvent',
  payload: { blocks: [{ height: 0 }, { height: 1 }, { height: 2 }] },
  blockHeight: 2,
  isCompressed: 0,
  timestamp: Math.trunc(Date.now() * 1000),
};
