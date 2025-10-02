import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BitcoinMempoolClearedEvent } from '@easylayer/bitcoin';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import { mempoolTableSQL, seedMempoolEvent } from './mocks';

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

describe('/Bitcoin Crawler: Clear Mempool Table Flow', () => {
  let db!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.resetModules();

    config({ path: resolve(process.cwd(), 'src/second-app-init/clear-mempool-table-flow/.env') });
    await cleanDataFolder('eventstore');

    db = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await db.connect();
    await db.exec(mempoolTableSQL);

    const payloadBuf = Buffer.from(JSON.stringify(seedMempoolEvent.payload), 'utf8');
    const insertSql = `
      INSERT INTO mempool (version, requestId, type, payload, blockHeight, isCompressed, timestamp)
      VALUES (
        ${seedMempoolEvent.version},
        '${escapeSqlString(seedMempoolEvent.requestId)}',
        '${escapeSqlString(seedMempoolEvent.type)}',
        ${bufferToHexLiteral(payloadBuf)},
        ${seedMempoolEvent.blockHeight === null ? 'NULL' : seedMempoolEvent.blockHeight},
        ${seedMempoolEvent.isCompressed ?? 0},
        ${seedMempoolEvent.timestamp}
      );
    `;
    await db.exec(insertSql);

    await bootstrap({
      testing: {
        handlerEventsToWait: [{ eventType: BitcoinMempoolClearedEvent, count: 1 }],
      },
    });

    jest.runAllTimers();
  });

  afterAll(async () => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (db) {
      // eslint-disable-next-line no-console
      await db.close().catch(console.error);
    }
  });

  it('should clear mempool table', async () => {
    const [{ integrity_check }] = await db.all(`PRAGMA integrity_check`);
    expect(integrity_check).toBe('ok');

    const rows = await db.all(
      `SELECT id, version, requestId, type, blockHeight, timestamp FROM mempool ORDER BY id ASC`
    );
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(2);
    expect(rows[0].type).toBe('BitcoinMempoolClearedEvent');
    expect(rows[1].type).toBe('BitcoinMempoolInitializedEvent');
  });
});
