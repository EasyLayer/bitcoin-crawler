import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BitcoinNetworkInitializedEvent } from '@easylayer/bitcoin';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import type { NetworkRecord } from './mocks';
import { checkpointAheadNetworkEvents, checkpointRollbackNetworkEvents, networkTableSQL } from './mocks';

function escapeSqlString(s: string): string {
  return s.replace(/'/g, "''");
}

function bufferToHexLiteral(b: Buffer): string {
  return `X'${b.toString('hex')}'`;
}

async function seedNetworkTable(db: SQLiteService, records: NetworkRecord[]): Promise<void> {
  await db.exec(networkTableSQL);

  for (const rec of records) {
    const payloadBuf = Buffer.from(JSON.stringify(rec.payload), 'utf8');
    const sql = `
      INSERT INTO network
        (version, requestId, type, payload, blockHeight, isCompressed, timestamp)
      VALUES
        (
          ${rec.version},
          '${escapeSqlString(rec.requestId)}',
          '${escapeSqlString(rec.type)}',
          ${bufferToHexLiteral(payloadBuf)},
          ${rec.blockHeight === null ? 'NULL' : rec.blockHeight},
          ${rec.isCompressed ?? 0},
          ${rec.timestamp}
        );
    `;
    await db.exec(sql);
  }
}

describe('/Bitcoin Crawler: Second Initialization External Checkpoint Flow', () => {
  let db!: SQLiteService;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    config({ path: resolve(process.cwd(), 'src/second-app-init/external-checkpoint-flow/.env') });
    await cleanDataFolder('eventstore');

    db = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await db.connect();
  });

  afterEach(async () => {
    if (db) {
      await db.close().catch(() => undefined as any);
    }
    jest.restoreAllMocks();
  });

  it('should rollback EventStore down to external checkpoint when local write model is ahead', async () => {
    await seedNetworkTable(db, checkpointRollbackNetworkEvents);
    await db.close();

    await bootstrap({
      config: { lastBlockHeight: 1 },
      testing: {
        handlerEventsToWait: [{ eventType: BitcoinNetworkInitializedEvent, count: 1 }],
      },
    });

    db = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await db.connect();

    const rows = await db.all(`
      SELECT id, version, requestId, type, blockHeight
      FROM network
      ORDER BY id ASC
    `);

    expect(rows.some((row: any) => row.blockHeight > 1)).toBe(false);
    expect(rows.some((row: any) => row.type === 'BitcoinNetworkBlocksAddedEvent' && row.blockHeight === 2)).toBe(false);
    expect(rows.some((row: any) => row.type === 'BitcoinNetworkBlocksAddedEvent' && row.blockHeight === 3)).toBe(false);

    const latest = rows[rows.length - 1];
    expect(latest.type).toBe('BitcoinNetworkInitializedEvent');
    expect(latest.blockHeight).toBe(1);
  });

  it('should fail fast when external checkpoint is ahead of local EventStore', async () => {
    await seedNetworkTable(db, checkpointAheadNetworkEvents);
    await db.close();

    await expect(
      bootstrap({
        config: { lastBlockHeight: 2 },
      })
    ).rejects.toThrow('External checkpoint (2) is ahead of local EventStore (0)');
  });
});
