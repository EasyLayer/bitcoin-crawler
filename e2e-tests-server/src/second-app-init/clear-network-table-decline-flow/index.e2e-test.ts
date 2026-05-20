import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BlockchainProviderService } from '@easylayer/bitcoin';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import { networkTableSQL, seedNetworkEvent } from './mocks';

jest.mock('readline', () => ({
  createInterface: () => ({
    question: (_q: string, cb: (answer: string) => void) => cb('no'),
    close: () => undefined,
  }),
}));

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(-1);

function escapeSqlString(s: string): string {
  return s.replace(/'/g, "''");
}
function bufferToHexLiteral(b: Buffer): string {
  return `X'${b.toString('hex')}'`;
}

describe('/Bitcoin Crawler: Clear Network Table — Decline Flow', () => {
  let db!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();
    config({ path: resolve(process.cwd(), 'src/second-app-init/clear-network-table-decline-flow/.env') });
    await cleanDataFolder('eventstore');

    db = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await db.connect();
    await db.exec(networkTableSQL);

    const payloadBuf = Buffer.from(JSON.stringify(seedNetworkEvent.payload), 'utf8');
    await db.exec(`
      INSERT INTO network (version, requestId, type, payload, blockHeight, isCompressed, timestamp)
      VALUES (${seedNetworkEvent.version}, '${escapeSqlString(seedNetworkEvent.requestId)}',
              '${escapeSqlString(seedNetworkEvent.type)}', ${bufferToHexLiteral(payloadBuf)},
              ${seedNetworkEvent.blockHeight === null ? 'NULL' : seedNetworkEvent.blockHeight},
              ${seedNetworkEvent.isCompressed ?? 0}, ${seedNetworkEvent.timestamp});
    `);
    await db.close();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await db?.close().catch(() => {});
  });

  it('should reject bootstrap with "cancelled by user" when prompt answer is no', async () => {
    await expect(bootstrap({})).rejects.toThrow(/cancelled by user/);
  });

  it('should NOT have written BitcoinNetworkClearedEvent (data preserved)', async () => {
    db = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await db.connect();

    const [integrity] = await db.all(`PRAGMA integrity_check`);
    expect(integrity.integrity_check).toBe('ok');

    const rows = await db.all(`SELECT * FROM network ORDER BY id ASC`);
    // Original seed event must still be present; no Cleared event was emitted.
    expect(rows.some((r: any) => r.type === 'BitcoinNetworkClearedEvent')).toBe(false);
    // Seed BlocksAdded event still there
    expect(rows.some((r: any) => r.type === 'BitcoinNetworkBlocksAddedEvent' && r.blockHeight === 2)).toBe(true);
  });
});
