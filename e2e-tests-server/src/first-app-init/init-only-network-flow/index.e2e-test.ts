import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BitcoinNetworkInitializedEvent, BlockchainProviderService } from '@easylayer/bitcoin';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// getCurrentBlockHeight=-1 → while(-1 < -1) = false → no blocks loaded.
// Prevents blocks-loader from making real RPC calls during an init-only test.
jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(-1);

describe('Bitcoin Crawler: First Initialization Only Network Flow', () => {
  let dbService!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();
    config({ path: resolve(process.cwd(), 'src/first-app-init/init-only-network-flow/.env') });
    await cleanDataFolder('eventstore');
    await bootstrap({
      testing: {
        handlerEventsToWait: [{ eventType: BitcoinNetworkInitializedEvent, count: 1 }],
      },
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await dbService?.close().catch(() => {});
  });

  it('should bootstrap, create database with required tables, and persist initialization events', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    // integrity
    const [integrity] = await dbService.all(`PRAGMA integrity_check`);
    expect(integrity.integrity_check).toBe('ok');

    // tables
    const tables = await dbService.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    expect(tables.map((t: any) => t.name)).toEqual(expect.arrayContaining(['snapshots', 'outbox', 'network']));

    // schema
    const cols = await dbService.all(`PRAGMA table_info('network')`);
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

    // exactly 1 event
    const networkEvents = await dbService.all(`SELECT * FROM network ORDER BY id ASC`);
    expect(networkEvents.length).toBe(1);

    const ev = networkEvents[0];
    expect(ev.version).toBe(1);
    expect(ev.type).toBe('BitcoinNetworkInitializedEvent');
    expect(ev.blockHeight).toBe(null);
    expect(UUID_RE.test(ev.requestId)).toBe(true);

    const raw = ev.payload;
    const str = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
    expect(() => JSON.parse(str)).not.toThrow();

    expect(Number.isInteger(ev.timestamp)).toBe(true);
    expect(ev.timestamp).toBeGreaterThan(1e15);
    expect(ev.timestamp).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    expect([0, 1]).toContain(ev.isCompressed);

    // outbox empty — no transports configured
    const outbox = await dbService.all(`SELECT COUNT(*) AS c FROM outbox`);
    expect(Number(outbox[0]?.c)).toBe(0);

    // snapshots empty — only 1 event, snapshot threshold not reached
    const snaps = await dbService.all(`SELECT COUNT(*) AS c FROM snapshots`);
    expect(Number(snaps[0]?.c)).toBe(0);
  });
});
