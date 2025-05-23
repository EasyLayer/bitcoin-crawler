// import { v4 as uuidv4 } from 'uuid';
import { EventStatus } from '@easylayer/common/cqrs';
import { AGGREGATE_ID } from './blocks.model';

export interface NetworkEventStoreRecord {
  version: number;
  requestId: string;
  status: EventStatus;
  type: string;
  payload: Record<string, any>;
  blockHeight: number;
}

export interface BlocksEventStoreRecord {
  version: number;
  requestId: string;
  status: EventStatus;
  type: string;
  payload: Record<string, any>;
  blockHeight: number;
}

export const mockBlocks = [
  {
    hash: '0000000000000000000000000000000000000000000000000000000000000001',
    confirmations: 4,
    strippedsize: 204,
    size: 204,
    weight: 816,
    height: 0,
    version: 1,
    versionHex: '00000001',
    merkleroot: '4d6f636b4d65726b6c65526f6f74000000000000000000000000000000000000',
    tx: [
      {
        txid: 'tx0-1',
        hash: 'abcd1234',
        hex: 'ffff0000000000',
        version: 1,
        size: 134,
        vsize: 134,
        weight: 536,
        locktime: 0,
        vin: [
          {
            coinbase: '03e8a34d696e656420627920416e74506f6f6c312c204c4c43',
            sequence: 4294967295,
          },
        ],
        vout: [
          {
            value: 50.0,
            n: 0,
            scriptPubKey: {
              asm: 'OP_DUP OP_HASH160 1bc3305d889ed9519b8ab87cd43968b64f2d380d OP_EQUALVERIFY OP_CHECKSIG',
              hex: '76a9141bc3305d889ed9519b8ab87cd43968b64f2d380d88ac',
              reqSigs: 1,
              type: 'pubkeyhash',
              addresses: ['1BitcoinAddress'],
            },
          },
        ],
      },
    ],
    time: 1610000000,
    mediantime: 1610000000,
    nonce: 0,
    bits: '1d00ffff',
    difficulty: 1,
    chainwork: '0000000000000000000000000000000000000000000000000000000100010001',
    nextblockhash: '0000000000000000000000000000000000000000000000000000000000000002',
  },
  {
    hash: '0000000000000000000000000000000000000000000000000000000000000002',
    confirmations: 3,
    strippedsize: 204,
    size: 204,
    weight: 816,
    height: 1,
    version: 1,
    versionHex: '00000001',
    merkleroot: '4d6f636b4d65726b6c65526f6f74000000000000000000000000000000000000',
    tx: [
      {
        txid: 'tx1-1',
        hash: 'abcd1235',
        hex: 'ffff0000000000',
        version: 1,
        size: 134,
        vsize: 134,
        weight: 536,
        locktime: 0,
        vin: [
          {
            coinbase: '03e8a34d696e656420627920416e74506f6f6c312c204c4c44',
            sequence: 4294967295,
          },
        ],
        vout: [
          {
            value: 50.0,
            n: 0,
            scriptPubKey: {
              asm: 'OP_DUP OP_HASH160 1bc3305d889ed9519b8ab87cd43968b64f2d380d OP_EQUALVERIFY OP_CHECKSIG',
              hex: '76a9141bc3305d889ed9519b8ab87cd43968b64f2d380d88ac',
              reqSigs: 1,
              type: 'pubkeyhash',
              addresses: ['1BitcoinAddress'],
            },
          },
        ],
      },
      {
        txid: 'tx1-2',
        hash: 'abcd1236',
        hex: 'ffff000000000q',
        version: 1,
        size: 144,
        vsize: 144,
        weight: 576,
        locktime: 0,
        vin: [
          {
            txid: 'tx0-1',
            vout: 0,
            scriptSig: {
              asm: '3045022100abcdef...022100123456...',
              hex: '483045022100abcdef...022100123456...',
            },
            sequence: 4294967294,
          },
        ],
        vout: [
          {
            value: 25.0,
            n: 0,
            scriptPubKey: {
              asm: 'OP_DUP OP_HASH160 2bc3305d889ed9519b8ab87cd43968b64f2d380d OP_EQUALVERIFY OP_CHECKSIG',
              hex: '76a9142bc3305d889ed9519b8ab87cd43968b64f2d380d88ac',
              reqSigs: 1,
              type: 'pubkeyhash',
              addresses: ['1BitcoinAddress1'],
            },
          },
          {
            value: 25.0,
            n: 1,
            scriptPubKey: {
              asm: 'OP_DUP OP_HASH160 3bc3305d889ed9519b8ab87cd43968b64f2d380d OP_EQUALVERIFY OP_CHECKSIG',
              hex: '76a9143bc3305d889ed9519b8ab87cd43968b64f2d380d88ac',
              reqSigs: 1,
              type: 'pubkeyhash',
              addresses: ['1BitcoinAddress2'],
            },
          },
        ],
      },
    ],
    time: 1610001000,
    mediantime: 1610001000,
    nonce: 1,
    bits: '1d00ffff',
    difficulty: 1,
    chainwork: '0000000000000000000000000000000000000000000000000000000200020002',
    previousblockhash: '0000000000000000000000000000000000000000000000000000000000000001',
    nextblockhash: '0000000000000000000000000000000000000000000000000000000000000003',
  },
  {
    hash: '0000000000000000000000000000000000000000000000000000000000000003',
    confirmations: 2,
    strippedsize: 204,
    size: 204,
    weight: 816,
    height: 2,
    version: 1,
    versionHex: '00000001',
    merkleroot: '4d6f636b4d65726b6c65526f6f74000000000000000000000000000000000000',
    tx: [
      {
        txid: 'tx2-1',
        hash: 'abcd1237',
        hex: 'ffff0000000000',
        version: 1,
        size: 134,
        vsize: 134,
        weight: 536,
        locktime: 0,
        vin: [
          {
            coinbase: '03e8a34d696e656420627920416e74506f6f6c312c204c4c45',
            sequence: 4294967295,
          },
        ],
        vout: [
          {
            value: 50.0,
            n: 0,
            scriptPubKey: {
              asm: 'OP_DUP OP_HASH160 1bc3305d889ed9519b8ab87cd43968b64f2d380d OP_EQUALVERIFY OP_CHECKSIG',
              hex: '76a9141bc3305d889ed9519b8ab87cd43968b64f2d380d88ac',
              reqSigs: 1,
              type: 'pubkeyhash',
              addresses: ['1BitcoinAddress'],
            },
          },
        ],
      },
      {
        txid: 'tx2-2',
        hash: 'abcd1238',
        hex: 'ffff0000000000',
        version: 1,
        size: 144,
        vsize: 144,
        weight: 576,
        locktime: 0,
        vin: [
          {
            txid: 'tx1-1',
            vout: 0,
            scriptSig: {
              asm: '3045022100abcdef...022100123456...',
              hex: '483045022100abcdef...022100123456...',
            },
            sequence: 4294967294,
          },
        ],
        vout: [
          {
            value: 25.0,
            n: 0,
            scriptPubKey: {
              asm: 'OP_DUP OP_HASH160 2bc3305d889ed9519b8ab87cd43968b64f2d380d OP_EQUALVERIFY OP_CHECKSIG',
              hex: '76a9142bc3305d889ed9519b8ab87cd43968b64f2d380d88ac',
              reqSigs: 1,
              type: 'pubkeyhash',
              addresses: ['1BitcoinAddress1'],
            },
          },
          {
            value: 25.0,
            n: 1,
            scriptPubKey: {
              asm: 'OP_DUP OP_HASH160 3bc3305d889ed9519b8ab87cd43968b64f2d380d OP_EQUALVERIFY OP_CHECKSIG',
              hex: '76a9143bc3305d889ed9519b8ab87cd43968b64f2d380d88ac',
              reqSigs: 1,
              type: 'pubkeyhash',
              addresses: ['1BitcoinAddress2'],
            },
          },
        ],
      },
    ],
    time: 1610002000,
    mediantime: 1610002000,
    nonce: 2,
    bits: '1d00ffff',
    difficulty: 1,
    chainwork: '0000000000000000000000000000000000000000000000000000000300030003',
    previousblockhash: '0000000000000000000000000000000000000000000000000000000000000002',
    nextblockhash: '0000000000000000000000000000000000000000000000000000000000000004',
  },
];

export const networkTableSQL = `
CREATE TABLE IF NOT EXISTS network (
  version     INTEGER PRIMARY KEY DEFAULT 0,
  requestId   VARCHAR        DEFAULT NULL,
  status      TEXT           DEFAULT '${EventStatus.UNPUBLISHED}',
  type        VARCHAR        NOT NULL,
  payload     JSON           NOT NULL,
  blockHeight INTEGER        DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS UQ_network_v_reqid
  ON network (version, requestId);
CREATE INDEX IF NOT EXISTS IDX_network_blockh
  ON network (blockHeight);
`;

export const blocksTableSQL = `
CREATE TABLE IF NOT EXISTS ${AGGREGATE_ID} (
  version     INTEGER PRIMARY KEY DEFAULT 0,
  requestId   VARCHAR        DEFAULT NULL,
  status      TEXT           DEFAULT '${EventStatus.UNPUBLISHED}',
  type        VARCHAR        NOT NULL,
  payload     JSON           NOT NULL,
  blockHeight INTEGER        DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS UQ_blocks_v_reqid
  ON network (version, requestId);
CREATE INDEX IF NOT EXISTS IDX_blocks_blockh
  ON network (blockHeight);
`;

export const mockNetworks: NetworkEventStoreRecord[] = [
  {
    version: 1,
    requestId: 'req-1',
    status: EventStatus.PUBLISHED,
    type: 'BitcoinNetworkInitializedEvent',
    payload: {},
    blockHeight: 0,
  },
  {
    version: 2,
    requestId: 'req-2',
    status: EventStatus.PUBLISHED,
    type: 'BitcoinNetworkBlocksAddedEvent',
    payload: {
      blocks: mockBlocks.map((block) => ({
        height: block.height,
        hash: block.hash,
        previousblockhash: block.previousblockhash,
        tx: block.tx.map((t: any) => t.txid),
      })),
    },
    blockHeight: 2,
  },
];

export const mockBlockModel: NetworkEventStoreRecord[] = [
  {
    version: 1,
    requestId: 'req-1',
    status: EventStatus.PUBLISHED,
    type: 'BlockAddedEvent',
    payload: {
      block: {
        height: mockBlocks[0]!.height,
        hash: mockBlocks[0]!.hash,
        previousblockhash: mockBlocks[0]!.previousblockhash,
        tx: mockBlocks[0]!.tx.map((t: any) => t.txid),
      },
    },
    blockHeight: 0,
  },
  {
    version: 2,
    requestId: 'req-2',
    status: EventStatus.PUBLISHED,
    type: 'BlockAddedEvent',
    payload: {
      block: {
        height: mockBlocks[1]!.height,
        hash: mockBlocks[1]!.hash,
        previousblockhash: mockBlocks[1]!.previousblockhash,
        tx: mockBlocks[1]!.tx.map((t: any) => t.txid),
      },
    },
    blockHeight: 1,
  },
  {
    version: 3,
    requestId: 'req-3',
    status: EventStatus.PUBLISHED,
    type: 'BlockAddedEvent',
    payload: {
      block: {
        height: mockBlocks[2]!.height,
        hash: mockBlocks[2]!.hash,
        previousblockhash: mockBlocks[2]!.previousblockhash,
        tx: mockBlocks[2]!.tx.map((t: any) => t.txid),
      },
    },
    blockHeight: 2,
  },
];
