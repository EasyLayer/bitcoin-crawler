import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import {
  BitcoinMempoolInitializedEvent,
  BitcoinMempoolSynchronizedEvent,
  BitcoinMempoolRefreshedEvent,
} from '@easylayer/bitcoin';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';

describe('/Bitcoin Crawler: First Initialization Mempool Flow', () => {
  let dbService!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.resetModules();
    config({ path: resolve(process.cwd(), 'src/first-app-init/init-with-mempool-flow/.env') });
    await cleanDataFolder('eventstore');
    await bootstrap({
      testing: {
        handlerEventsToWait: [
          { eventType: BitcoinMempoolInitializedEvent, count: 1 },
          { eventType: BitcoinMempoolRefreshedEvent, count: 1 },
          { eventType: BitcoinMempoolSynchronizedEvent, count: 1 },
        ],
      },
    });
    jest.runAllTimers();
  });

  afterAll(async () => {
    jest.useRealTimers();
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
    expect(mempoolEvents.length).toBe(3);

    const e1 = mempoolEvents[0];
    expect(e1.version).toBe(1);
    expect(e1.type).toBe('BitcoinMempoolInitializedEvent');
    expect(typeof e1.requestId).toBe('string');
    expect(e1.requestId.length).toBeGreaterThan(0);
    expect(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(e1.requestId)).toBe(true);
    expect(Number.isInteger(e1.blockHeight)).toBe(true);
    expect(e1.blockHeight).toBeGreaterThan(0);
    const rawPayload1 = e1.payload;
    const payloadString1 = Buffer.isBuffer(rawPayload1) ? rawPayload1.toString('utf8') : String(rawPayload1);
    expect(() => JSON.parse(payloadString1)).not.toThrow();
    const payloadObj1 = JSON.parse(payloadString1);
    expect(payloadObj1 && typeof payloadObj1 === 'object').toBe(true);
    expect(Number.isInteger(e1.timestamp)).toBe(true);
    expect(e1.timestamp).toBeGreaterThan(1e15);
    expect(e1.timestamp).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    expect([0, 1]).toContain(e1.isCompressed);

    const e2 = mempoolEvents[1];
    expect(e2.version).toBe(2);
    expect(e2.type).toBe('BitcoinMempoolRefreshedEvent');
    expect(typeof e2.requestId).toBe('string');
    expect(e2.requestId.length).toBeGreaterThan(0);
    expect(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(e2.requestId)).toBe(true);
    expect(Number.isInteger(e2.blockHeight)).toBe(true);
    expect(e2.blockHeight).toBeGreaterThan(0);
    const rawPayload2 = e2.payload;
    const payloadString2 = Buffer.isBuffer(rawPayload2) ? rawPayload2.toString('utf8') : String(rawPayload2);
    expect(() => JSON.parse(payloadString2)).not.toThrow();
    const payloadObj2 = JSON.parse(payloadString2);
    expect(payloadObj2 && typeof payloadObj2 === 'object').toBe(true);
    expect(Number.isInteger(e2.timestamp)).toBe(true);
    expect(e2.timestamp).toBeGreaterThan(1e15);
    expect(e2.timestamp).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    expect([0, 1]).toContain(e2.isCompressed);

    const e3 = mempoolEvents[2];
    expect(e3.version).toBe(3);
    expect(e3.type).toBe('BitcoinMempoolSynchronizedEvent');
    expect(typeof e3.requestId).toBe('string');
    expect(e3.requestId.length).toBeGreaterThan(0);
    expect(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(e3.requestId)).toBe(true);
    expect(Number.isInteger(e3.blockHeight)).toBe(true);
    expect(e3.blockHeight).toBeGreaterThan(0);
    const rawPayload3 = e3.payload;
    const payloadString3 = Buffer.isBuffer(rawPayload3) ? rawPayload3.toString('utf8') : String(rawPayload3);
    expect(() => JSON.parse(payloadString3)).not.toThrow();
    const payloadObj3 = JSON.parse(payloadString3);
    expect(payloadObj3 && typeof payloadObj3 === 'object').toBe(true);
    expect(Number.isInteger(e3.timestamp)).toBe(true);
    expect(e3.timestamp).toBeGreaterThan(1e15);
    expect(e3.timestamp).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    expect([0, 1]).toContain(e3.isCompressed);
  });
});
