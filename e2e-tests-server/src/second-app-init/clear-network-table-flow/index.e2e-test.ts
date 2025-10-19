import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BitcoinNetworkClearedEvent } from '@easylayer/bitcoin';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import { networkTableSQL, seedNetworkEvent } from './mocks';

jest.mock('readline', () => ({
  createInterface: () => ({
    question: (_q: string, cb: (answer: string) => void) => cb('yes'),
    close: () => undefined,
  }),
}));

function escapeSqlString(s: string): string {
  return s.replace(/'/g, "''");
}

function bufferToHexLiteral(b: Buffer): string {
  return `X'${b.toString('hex')}'`;
}

describe('/Bitcoin Crawler: Clear Network Table Flow', () => {
  let db!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();

    config({ path: resolve(process.cwd(), 'src/second-app-init/clear-network-table-flow/.env') });
    await cleanDataFolder('eventstore');

    db = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await db.connect();
    await db.exec(networkTableSQL);

    const payloadBuf = Buffer.from(JSON.stringify(seedNetworkEvent.payload), 'utf8');
    const insertSql = `
      INSERT INTO network (version, requestId, type, payload, blockHeight, isCompressed, timestamp)
      VALUES (
        ${seedNetworkEvent.version},
        '${escapeSqlString(seedNetworkEvent.requestId)}',
        '${escapeSqlString(seedNetworkEvent.type)}',
        ${bufferToHexLiteral(payloadBuf)},
        ${seedNetworkEvent.blockHeight === null ? 'NULL' : seedNetworkEvent.blockHeight},
        ${seedNetworkEvent.isCompressed ?? 0},
        ${seedNetworkEvent.timestamp}
      );
    `;
    await db.exec(insertSql);

    await bootstrap({
      testing: {
        handlerEventsToWait: [{ eventType: BitcoinNetworkClearedEvent, count: 1 }],
      },
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    if (db) {
      // eslint-disable-next-line no-console
      await db.close().catch(console.error);
    }
  });

  it('should clear network table', async () => {
    const [{ integrity_check }] = await db.all(`PRAGMA integrity_check`);
    expect(integrity_check).toBe('ok');

    const rows = await db.all(
      `SELECT id, version, requestId, type, blockHeight, timestamp FROM network ORDER BY id ASC`
    );
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(2);
    expect(rows[0].type).toBe('BitcoinNetworkClearedEvent');
    expect(rows[1].type).toBe('BitcoinNetworkInitializedEvent');
  });
});
