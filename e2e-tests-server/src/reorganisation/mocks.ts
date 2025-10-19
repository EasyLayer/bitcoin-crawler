// size for each block should be equel queueIteratorBlocksBatchSize if we want peek by ONE block
export const reorgBlock = {
  hash: '0000000000000000000000000000000000000000000000000000000000000001',
  confirmations: 4,
  strippedsize: 204,
  size: 3, // NETWORK_MAX_BLOCK_WEIGHT * 2 + 1
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
  previousblockhash: '0000000000000000000000000000000000000000000000000000000000000000',
  nextblockhash: '0000000000000000000000000000000000000000000000000000000000000002',
};

// First block - reorgBlock.
// Blocks are valid from 1 to 3, there should be a reorganization on 4's block.
// These mocks are necessary to start the reorganisation process.
export const mockFakeChainBlocks = [
  reorgBlock,
  {
    hash: '2000000000000000000000000000000000000000000000000000000000000002',
    confirmations: 3,
    strippedsize: 204,
    size: 3, // NETWORK_MAX_BLOCK_WEIGHT * 2 + 1
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
    ],
    time: 1610001000,
    mediantime: 1610001000,
    nonce: 1,
    bits: '1d00ffff',
    difficulty: 1,
    chainwork: '0000000000000000000000000000000000000000000000000000000200020002',
    previousblockhash: '0000000000000000000000000000000000000000000000000000000000000001',
    nextblockhash: '3000000000000000000000000000000000000000000000000000000000000003',
  },
  {
    hash: '3000000000000000000000000000000000000000000000000000000000000003',
    confirmations: 2,
    strippedsize: 204,
    size: 3, // NETWORK_MAX_BLOCK_WEIGHT * 2 + 1
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
    ],
    time: 1610002000,
    mediantime: 1610002000,
    nonce: 2,
    bits: '1d00ffff',
    difficulty: 1,
    chainwork: '0000000000000000000000000000000000000000000000000000000300030003',
    previousblockhash: '2000000000000000000000000000000000000000000000000000000000000002',
    nextblockhash: '4000000000000000000000000000000000000000000000000000000000000004',
  },
  // fake block
  {
    hash: '4000000000000000000000000000000000000000000000000000000000000004',
    confirmations: 1,
    strippedsize: 204,
    size: 3, // NETWORK_MAX_BLOCK_WEIGHT * 2 + 1
    weight: 816,
    height: 3,
    version: 1,
    versionHex: '00000001',
    merkleroot: '4d6f636b4d65726b6c65526f6f74000000000000000000000000000000000000',
    tx: [
      {
        txid: 'tx3-1',
        hash: 'abcd1239',
        hex: 'ffff0000000000',
        version: 1,
        size: 134,
        vsize: 134,
        weight: 536,
        locktime: 0,
        vin: [
          {
            coinbase: '03e8a34d696e656420627920416e74506f6f6c312c204c4c46',
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
    time: 1610003000,
    mediantime: 1610003000,
    nonce: 3,
    bits: '1d00ffff',
    difficulty: 1,
    chainwork: '0000000000000000000000000000000000000000000000000000000400040004',
    previousblockhash: '0000000000000000000000000000000000000000000000000000000000000033', // fake
    nextblockhash: '',
  },
];

// The chain is completely real.
// First block - reorgBlock.
// This array is necessary for us to find the last height where the blocks coincided (the first block)
// and find out the height of the reorganization.
export const mockRealChainBlocks = [
  reorgBlock,
  {
    hash: '0000000000000000000000000000000000000000000000000000000000000002',
    confirmations: 3,
    strippedsize: 204,
    size: 3, // NETWORK_MAX_BLOCK_WEIGHT * 2 + 1
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
];
