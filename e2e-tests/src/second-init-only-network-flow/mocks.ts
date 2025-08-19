import { EventStatus } from '@easylayer/common/cqrs';

export interface NetworkRecord {
  version: number;
  requestId: string;
  status: EventStatus;
  type: string;
  payload: Record<string, any>;
  blockHeight: number;
}

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

export const mockNetworks: NetworkRecord[] = [
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
      blocks: [
        {
          hash: '000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943',
          confirmations: 1504848,
          height: 0,
          version: 1,
          versionHex: '00000001',
          merkleroot: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
          time: 1296688602,
          mediantime: 1296688602,
          nonce: 414098458,
          bits: '1d00ffff',
          difficulty: 1,
          chainwork: '0000000000000000000000000000000000000000000000000000000100010001',
          nTx: 1,
          nextblockhash: '00000000b873e79784647a6c82962c70d228557d24a747ea4d1b8bbe878e1206',
          strippedsize: 285,
          size: 285,
          weight: 1140,
          tx: [
            {
              txid: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
              hash: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
              version: 1,
              size: 204,
              vsize: 204,
              weight: 816,
              locktime: 0,
              vin: [
                {
                  coinbase:
                    '04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73',
                  sequence: 4294967295,
                },
              ],
              vout: [
                {
                  value: 50,
                  n: 0,
                  scriptPubKey: {
                    asm: '04678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5f OP_CHECKSIG',
                    desc: 'pk(04678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5f)#vlz6ztea',
                    hex: '4104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac',
                    type: 'pubkey',
                  },
                },
              ],
            },
          ],
        },
        {
          hash: '00000000b873e79784647a6c82962c70d228557d24a747ea4d1b8bbe878e1206',
          confirmations: 1504847,
          height: 1,
          version: 1,
          versionHex: '00000001',
          merkleroot: 'f0315ffc38709d70ad5647e22048358dd3745f3ce3874223c80a7c92fab0c8ba',
          time: 1296688928,
          mediantime: 1296688928,
          nonce: 1924588547,
          bits: '1d00ffff',
          difficulty: 1,
          chainwork: '0000000000000000000000000000000000000000000000000000000200020002',
          nTx: 1,
          previousblockhash: '000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943',
          nextblockhash: '000000006c02c8ea6e4ff69651f7fcde348fb9d557a06e6957b65552002a7820',
          strippedsize: 190,
          size: 190,
          weight: 760,
          tx: [
            {
              txid: 'f0315ffc38709d70ad5647e22048358dd3745f3ce3874223c80a7c92fab0c8ba',
              hash: 'f0315ffc38709d70ad5647e22048358dd3745f3ce3874223c80a7c92fab0c8ba',
              version: 1,
              size: 109,
              vsize: 109,
              weight: 436,
              locktime: 0,
              vin: [
                {
                  coinbase: '0420e7494d017f062f503253482f',
                  sequence: 4294967295,
                },
              ],
              vout: [
                {
                  value: 50,
                  n: 0,
                  scriptPubKey: {
                    asm: '021aeaf2f8638a129a3156fbe7e5ef635226b0bafd495ff03afe2c843d7e3a4b51 OP_CHECKSIG',
                    desc: 'pk(021aeaf2f8638a129a3156fbe7e5ef635226b0bafd495ff03afe2c843d7e3a4b51)#szvgjj6l',
                    hex: '21021aeaf2f8638a129a3156fbe7e5ef635226b0bafd495ff03afe2c843d7e3a4b51ac',
                    type: 'pubkey',
                  },
                },
              ],
            },
          ],
        },
        {
          hash: '000000006c02c8ea6e4ff69651f7fcde348fb9d557a06e6957b65552002a7820',
          confirmations: 1504846,
          height: 2,
          version: 1,
          versionHex: '00000001',
          merkleroot: '20222eb90f5895556926c112bb5aa0df4ab5abc3107e21a6950aec3b2e3541e2',
          time: 1296688946,
          mediantime: 1296688928,
          nonce: 875942400,
          bits: '1d00ffff',
          difficulty: 1,
          chainwork: '0000000000000000000000000000000000000000000000000000000300030003',
          nTx: 1,
          previousblockhash: '00000000b873e79784647a6c82962c70d228557d24a747ea4d1b8bbe878e1206',
          nextblockhash: '000000008b896e272758da5297bcd98fdc6d97c9b765ecec401e286dc1fdbe10',
          strippedsize: 190,
          size: 190,
          weight: 760,
          tx: [
            {
              txid: '20222eb90f5895556926c112bb5aa0df4ab5abc3107e21a6950aec3b2e3541e2',
              hash: '20222eb90f5895556926c112bb5aa0df4ab5abc3107e21a6950aec3b2e3541e2',
              version: 1,
              size: 109,
              vsize: 109,
              weight: 436,
              locktime: 0,
              vin: [
                {
                  coinbase: '0432e7494d010e062f503253482f',
                  sequence: 4294967295,
                },
              ],
              vout: [
                {
                  value: 50,
                  n: 0,
                  scriptPubKey: {
                    asm: '038a7f6ef1c8ca0c588aa53fa860128077c9e6c11e6830f4d7ee4e763a56b7718f OP_CHECKSIG',
                    desc: 'pk(038a7f6ef1c8ca0c588aa53fa860128077c9e6c11e6830f4d7ee4e763a56b7718f)#zqnpz6lx',
                    hex: '21038a7f6ef1c8ca0c588aa53fa860128077c9e6c11e6830f4d7ee4e763a56b7718fac',
                    type: 'pubkey',
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    blockHeight: 2,
  },
];
