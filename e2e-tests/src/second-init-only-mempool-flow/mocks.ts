import { EventStatus } from '@easylayer/common/cqrs';

export interface MempoolRecord {
  version: number;
  requestId: string;
  status: EventStatus;
  type: string;
  payload: Record<string, any>;
  blockHeight: number;
}

export const mempoolTableSQL = `
CREATE TABLE IF NOT EXISTS mempool (
  version     INTEGER PRIMARY KEY DEFAULT 0,
  requestId   VARCHAR        DEFAULT NULL,
  status      TEXT           DEFAULT '${EventStatus.UNPUBLISHED}',
  type        VARCHAR        NOT NULL,
  payload     JSON           NOT NULL,
  blockHeight INTEGER        DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS UQ_mempool_v_reqid
  ON mempool (version, requestId);
CREATE INDEX IF NOT EXISTS IDX_mempool_blockh
  ON mempool (blockHeight);
`;

export const mockMempool: MempoolRecord[] = [
  {
    version: 1,
    requestId: '70b33388-f4e1-4203-b136-6ca82c812578',
    status: EventStatus.PUBLISHED,
    type: 'BitcoinMempoolInitializedEvent',
    payload: {
      allTxidsFromNode: [],
      isSynchronized: false,
    },
    blockHeight: 1504847,
  },
  {
    version: 2,
    requestId: '1d71347b-0839-4d8c-8436-e92079d90ad1',
    status: EventStatus.UNPUBLISHED,
    type: 'BitcoinMempoolSyncProcessedEvent',
    payload: {
      loadedTransactions: [],
      hasMoreToProcess: false,
    },
    blockHeight: 1504847,
  },
  {
    version: 3,
    requestId: 'aa123456-1234-5678-9abc-def012345678',
    status: EventStatus.PUBLISHED,
    type: 'BitcoinMempoolSyncProcessedEvent',
    payload: {
      loadedTransactions: [
        {
          txid: 'abc123def456789012345678901234567890123456789012345678901234567890',
          transaction: {
            vsize: 250,
            fees: {
              base: 25000,
            },
            time: 1672531200,
            height: -1,
          },
        },
        {
          txid: 'def789abc123456789012345678901234567890123456789012345678901234567',
          transaction: {
            vsize: 180,
            fees: {
              base: 18000,
            },
            time: 1672531260,
            height: -1,
          },
        },
      ],
      hasMoreToProcess: true,
    },
    blockHeight: 1504847,
  },
];
