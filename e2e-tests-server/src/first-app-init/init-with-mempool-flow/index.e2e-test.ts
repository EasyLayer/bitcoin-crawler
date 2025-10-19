import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BitcoinMempoolInitializedEvent, BitcoinMempoolSynchronizedEvent } from '@easylayer/bitcoin';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';

describe('/Bitcoin Crawler: First Initialization Mempool Flow', () => {
  let dbService!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.useRealTimers();
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
    if (dbService) {
      // eslint-disable-next-line no-console
      await dbService.close().catch(console.error);
    }
  });

  it('should bootstrap, create database with required tables, and persist mempool initialization events', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    const integrityRows = await dbService.all(`PRAGMA integrity_check`);
    expect(integrityRows[0]?.integrity_check).toBe('ok');

    const tables = await dbService.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    const tableNames = tables.map((t: any) => t.name);
    expect(tableNames).toEqual(expect.arrayContaining(['snapshots', 'outbox', 'network', 'mempool']));

    const mempoolTableInfo = await dbService.all(`PRAGMA table_info('mempool')`);
    const mempoolColumns = mempoolTableInfo.map((c: any) => c.name);
    expect(mempoolColumns).toEqual(
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

    const mempoolEvents = await dbService.all(`SELECT * FROM mempool ORDER BY id ASC`);

    expect(Array.isArray(mempoolEvents)).toBe(true);
    expect(mempoolEvents.length).toBeGreaterThanOrEqual(2);

    const e1 = mempoolEvents[0];
    expect(e1.version).toBe(1);
    expect(e1.type).toBe('BitcoinMempoolInitializedEvent');
    expect(typeof e1.requestId).toBe('string');
    expect(e1.requestId.length).toBeGreaterThan(0);
    expect(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(e1.requestId)).toBe(true);
    expect(Number.isInteger(e1.blockHeight)).toBe(true);
    expect(e1.blockHeight).toBeGreaterThan(0);
    {
      const rawPayload1 = e1.payload;
      const payloadString1 = Buffer.isBuffer(rawPayload1) ? rawPayload1.toString('utf8') : String(rawPayload1);
      expect(() => JSON.parse(payloadString1)).not.toThrow();
      const payloadObj1 = JSON.parse(payloadString1);
      expect(payloadObj1 && typeof payloadObj1 === 'object').toBe(true);
    }
    expect(Number.isInteger(e1.timestamp)).toBe(true);
    expect(e1.timestamp).toBeGreaterThan(1e15);
    expect(e1.timestamp).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    expect([0, 1]).toContain(e1.isCompressed);

    const last = mempoolEvents[mempoolEvents.length - 1];
    expect(Number.isInteger(last.version)).toBe(true);
    expect(last.version).toBeGreaterThanOrEqual(e1.version);
    expect(last.type).toBe('BitcoinMempoolSynchronizedEvent');
    expect(last.type.length).toBeGreaterThan(0);
    expect(typeof last.requestId).toBe('string');
    expect(last.requestId.length).toBeGreaterThan(0);
    expect(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(last.requestId)).toBe(true);
    expect(Number.isInteger(last.blockHeight)).toBe(true);
    expect(last.blockHeight).toBeGreaterThan(0);

    {
      const rawPayload = last.payload;
      const payloadString = Buffer.isBuffer(rawPayload) ? rawPayload.toString('utf8') : String(rawPayload);
      expect(() => JSON.parse(payloadString)).not.toThrow();
      const payloadObj = JSON.parse(payloadString);
      expect(payloadObj && typeof payloadObj === 'object').toBe(true);
    }

    expect(Number.isInteger(last.timestamp)).toBe(true);
    expect(last.timestamp).toBeGreaterThan(1e15);
    expect(last.timestamp).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    expect([0, 1]).toContain(last.isCompressed);
  });
});
