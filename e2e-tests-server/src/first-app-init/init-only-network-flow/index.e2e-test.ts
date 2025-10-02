import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BitcoinNetworkInitializedEvent } from '@easylayer/bitcoin';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';

describe('Bitcoin Crawler: First Initializaton Only Network Flow', () => {
  let dbService!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.resetModules();
    config({ path: resolve(process.cwd(), 'src/first-app-init/init-only-network-flow/.env') });
    await cleanDataFolder('eventstore');
    await bootstrap({
      testing: {
        handlerEventsToWait: [{ eventType: BitcoinNetworkInitializedEvent, count: 1 }],
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

  it('should bootstrap, create database with required tables, and persist initialization events', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    const integrityRows = await dbService.all(`PRAGMA integrity_check`);
    expect(integrityRows[0]?.integrity_check).toBe('ok');

    const tables = await dbService.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    const tableNames = tables.map((t: any) => t.name);
    expect(tableNames).toEqual(expect.arrayContaining(['snapshots', 'outbox', 'network']));

    const networkTableInfo = await dbService.all(`PRAGMA table_info('network')`);
    const networkColumns = networkTableInfo.map((c: any) => c.name);
    expect(networkColumns).toEqual(
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

    const networkEvents = await dbService.all(`SELECT * FROM network ORDER BY id ASC`);
    expect(networkEvents.length).toBe(1);
    expect(networkEvents[0].version).toBe(1);
    expect(networkEvents[0].type).toBe('BitcoinNetworkInitializedEvent');
    expect(networkEvents[0].blockHeight).toBe(null);
    expect(typeof networkEvents[0].requestId).toBe('string');
    expect(networkEvents[0].requestId.length).toBeGreaterThan(0);
    expect(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(networkEvents[0].requestId)
    ).toBe(true);

    const rawPayload = networkEvents[0].payload;
    const payloadString = Buffer.isBuffer(rawPayload) ? rawPayload.toString('utf8') : String(rawPayload);
    expect(typeof payloadString).toBe('string');
    expect(() => JSON.parse(payloadString)).not.toThrow();

    const timestamp = networkEvents[0].timestamp;
    expect(Number.isInteger(timestamp)).toBe(true);
    expect(timestamp).toBeGreaterThan(1e15);
    expect(timestamp).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);

    const isCompressed = networkEvents[0].isCompressed;
    expect([0, 1]).toContain(isCompressed);

    const outboxCount = await dbService.all(`SELECT COUNT(*) AS c FROM outbox`);
    expect(Number(outboxCount[0]?.c ?? 0)).toBe(0);
  });
});
