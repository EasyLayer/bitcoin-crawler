export const mockMempoolTransactions = [
  {
    txid: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
    hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
    version: 2,
    size: 220,
    strippedsize: 160,
    sizeWithoutWitnesses: 160,
    vsize: 180,
    weight: 720,
    locktime: 0,
    fee: 3600,
    feeRate: 20,
    vin: [
      {
        txid: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc01',
        vout: 0,
        sequence: 0xffffffff,
      },
    ],
    vout: [
      {
        value: 0.0001,
        n: 0,
        scriptPubKey: {
          asm: '0 mock',
          hex: '0014'.padEnd(44, '0'),
          type: 'witness_v0_keyhash',
          address: 'tb1qmockaddressdecl0000000000000000000000000',
        },
      },
    ],
  },
  {
    txid: 'b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1',
    hash: 'b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1',
    version: 2,
    size: 230,
    strippedsize: 170,
    sizeWithoutWitnesses: 170,
    vsize: 190,
    weight: 760,
    locktime: 0,
    fee: 4750,
    feeRate: 25,
    vin: [
      {
        txid: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc02',
        vout: 1,
        sequence: 0xffffffff,
      },
    ],
    vout: [
      {
        value: 0.0002,
        n: 0,
        scriptPubKey: {
          asm: '0 mock',
          hex: '0014'.padEnd(44, '1'),
          type: 'witness_v0_keyhash',
          address: 'tb1qmockaddressdecl1111111111111111111111111',
        },
      },
    ],
  },
];
