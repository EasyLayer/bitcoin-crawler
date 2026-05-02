import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import {
  BitcoinMempoolInitializedEvent,
  BitcoinMempoolSynchronizedEvent,
  BitcoinNetworkInitializedEvent,
  BlockchainProviderService,
} from '@easylayer/bitcoin';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(-1);
jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromMempool').mockResolvedValue(850000);
jest.spyOn(BlockchainProviderService.prototype, 'getRawMempoolFromAll').mockResolvedValue([]);
jest.spyOn(BlockchainProviderService.prototype, 'getMempoolTransactionsByTxids').mockResolvedValue([]);

describe('/Bitcoin Crawler: First Initialization Mempool Flow', () => {
  let dbService!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();
    config({ path: resolve(process.cwd(), 'src/first-app-init/init-with-mempool-flow/.env') });
    await cleanDataFolder('eventstore');
    await bootstrap({
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

  it('should create DB with correct tables and schema', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    const [integrity] = await dbService.all(`PRAGMA integrity_check`);
    expect(integrity.integrity_check).toBe('ok');

    const tables = await dbService.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    expect(tables.map((t: any) => t.name)).toEqual(
      expect.arrayContaining(['snapshots', 'outbox', 'network', 'mempool'])
    );

    const cols = await dbService.all(`PRAGMA table_info('mempool')`);
    expect(cols.map((c: any) => c.name)).toEqual(
      expect.arrayContaining([
        'id',
        'version',
        'requestId',
        'type',
        'payload',
        'blockHeight',
        'isCompressed',
        'timestamp',
      ])
    );
  });

  it('should persist mempool initialization and sync events with correct metadata', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    const mempoolEvents = await dbService.all(`SELECT * FROM mempool ORDER BY id ASC`);
    expect(Array.isArray(mempoolEvents)).toBe(true);
    expect(mempoolEvents.length).toBeGreaterThanOrEqual(2);

    // All events have valid metadata
    mempoolEvents.forEach((ev: any, i: number) => {
      expect(ev.version).toBe(i + 1); // version increments strictly
      expect(UUID_RE.test(ev.requestId)).toBe(true);
      expect(Number.isInteger(ev.timestamp)).toBe(true);
      expect(ev.timestamp).toBeGreaterThan(1e15);
      expect(ev.timestamp).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
      expect([0, 1]).toContain(ev.isCompressed);
      const raw = ev.payload;
      const str = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
      expect(() => JSON.parse(str)).not.toThrow();
    });

    const first = mempoolEvents[0];
    expect(first.type).toBe('BitcoinMempoolInitializedEvent');
    expect(Number.isInteger(first.blockHeight)).toBe(true);
    expect(first.blockHeight).toBeGreaterThan(0);

    const last = mempoolEvents[mempoolEvents.length - 1];
    expect(last.type).toBe('BitcoinMempoolSynchronizedEvent');
    // BitcoinMempoolSynchronizedEvent does not update aggregate blockHeight —
    // the column can be null. We only check the init event carries a real height.
    // blockHeight is either null or a non-negative integer.
    if (last.blockHeight !== null) {
      expect(Number.isInteger(last.blockHeight)).toBe(true);
    }
  });

  it('should also have network table with NetworkInitializedEvent', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();
    const networkEvents = await dbService.all(`SELECT * FROM network`);
    expect(networkEvents.length).toBeGreaterThanOrEqual(1);
    expect(networkEvents.find((e: any) => e.type === BitcoinNetworkInitializedEvent.name)).toBeDefined();
  });
});
