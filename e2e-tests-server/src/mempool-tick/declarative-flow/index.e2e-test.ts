import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import {
  BitcoinMempoolInitializedEvent,
  BitcoinMempoolSynchronizedEvent,
  BlockchainProviderService,
} from '@easylayer/bitcoin';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import MempoolMonitoringModel, { AGGREGATE_ID, MempoolTickEvent, MempoolTxSeenEvent } from './mempool.model';
import { mockMempoolTransactions } from './mocks';

function makeMempoolTxMetadata(tx: (typeof mockMempoolTransactions)[number]) {
  // Core normalizer (UniversalTransformer.normalizeRpcMempoolEntry) converts BTC→sats
  // via toSmallestUnits before producing MempoolTxMetadata. By the time the metadata
  // hits Mempool.refresh, every fee field is already in satoshis. Our mock skips
  // the normalizer, so we provide values in satoshis directly.
  const feeSats = tx.fee ?? 0;
  return {
    txid: tx.txid,
    wtxid: tx.txid,
    vsize: tx.vsize,
    weight: tx.weight,
    fee: feeSats,
    modifiedfee: feeSats,
    time: Math.floor(Date.now() / 1000),
    height: 850000,
    depends: [],
    descendantcount: 1,
    descendantsize: tx.vsize,
    descendantfees: feeSats,
    ancestorcount: 1,
    ancestorsize: tx.vsize,
    ancestorfees: feeSats,
    fees: {
      base: feeSats,
      modified: feeSats,
      ancestor: feeSats,
      descendant: feeSats,
    },
    bip125_replaceable: false,
  };
}

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(-1);
jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromMempool').mockResolvedValue(850000);
jest.spyOn(BlockchainProviderService.prototype, 'getRawMempoolFromAll').mockResolvedValue([
  {
    providerName: 'rpc_1',
    value: Object.fromEntries(mockMempoolTransactions.map((tx) => [tx.txid, makeMempoolTxMetadata(tx)])),
  },
] as any);
jest
  .spyOn(BlockchainProviderService.prototype, 'getMempoolTransactionsByTxids')
  .mockImplementation(
    async (txids: string[]) =>
      mockMempoolTransactions.filter((tx) => txids.includes(tx.txid)).map((tx) => JSON.parse(JSON.stringify(tx))) as any
  );

function payloadToObject(p: any): any {
  if (p == null) return p;
  if (Buffer.isBuffer(p)) return JSON.parse(p.toString('utf8'));
  if (typeof p === 'string') return JSON.parse(p);
  return p;
}

describe('/Bitcoin Crawler: Mempool Monitoring Flow (declarative model)', () => {
  let dbService!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();
    config({ path: resolve(process.cwd(), 'src/mempool-tick/declarative-flow/.env') });
    await cleanDataFolder('eventstore');
    await bootstrap({
      Models: [MempoolMonitoringModel],
      testing: {
        handlerEventsToWait: [
          { eventType: BitcoinMempoolInitializedEvent, count: 1 },
          { eventType: BitcoinMempoolSynchronizedEvent, count: 1 },
        ],
      },
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await dbService?.close().catch(() => {});
  });

  it('should create user model table alongside network and mempool tables', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    const [integrity] = await dbService.all(`PRAGMA integrity_check`);
    expect(integrity.integrity_check).toBe('ok');

    const tables = await dbService.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    expect(tables.map((t: any) => t.name)).toEqual(
      expect.arrayContaining(['snapshots', 'outbox', 'network', 'mempool', AGGREGATE_ID])
    );
  });

  it('should invoke sources.mempool — MempoolTickEvent persisted in user model', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    const events = await dbService.all(`SELECT * FROM ${AGGREGATE_ID} ORDER BY version ASC`);
    const tickEvents = events.filter((e: any) => e.type === MempoolTickEvent.name);

    expect(tickEvents.length).toBeGreaterThanOrEqual(1);

    tickEvents.forEach((ev: any) => {
      const payload = payloadToObject(ev.payload);
      expect(payload).toHaveProperty('tickIndex');
      expect(typeof payload.tickIndex).toBe('number');
    });
  });

  it('should invoke sources.mempoolTx for each loaded transaction', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    const events = await dbService.all(`SELECT * FROM ${AGGREGATE_ID} ORDER BY version ASC`);
    const txEvents = events.filter((e: any) => e.type === MempoolTxSeenEvent.name);

    expect(txEvents.length).toBeGreaterThanOrEqual(mockMempoolTransactions.length);

    const seenTxids = new Set<string>();
    txEvents.forEach((ev: any) => {
      const payload = payloadToObject(ev.payload);
      expect(typeof payload.txid).toBe('string');
      seenTxids.add(payload.txid);
    });

    for (const tx of mockMempoolTransactions) {
      expect(seenTxids.has(tx.txid)).toBe(true);
    }
  });
});
