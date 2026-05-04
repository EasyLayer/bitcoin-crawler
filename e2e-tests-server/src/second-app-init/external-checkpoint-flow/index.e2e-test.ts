import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BitcoinNetworkInitializedEvent, BlockchainProviderService } from '@easylayer/bitcoin';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import type { NetworkRecord } from './mocks';
import { checkpointAheadNetworkEvents, checkpointRollbackNetworkEvents, networkTableSQL } from './mocks';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    await db.exec(`
      INSERT INTO network (version, requestId, type, payload, blockHeight, isCompressed, timestamp)
      VALUES (${rec.version}, '${escapeSqlString(rec.requestId)}', '${escapeSqlString(rec.type)}',
              ${bufferToHexLiteral(payloadBuf)},
              ${rec.blockHeight === null ? 'NULL' : rec.blockHeight},
              ${rec.isCompressed ?? 0}, ${rec.timestamp});
    `);
  }
}

describe('/Bitcoin Crawler: Second Initialization External Checkpoint Flow', () => {
  let db!: SQLiteService;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    // Re-apply after each afterEach restoreAllMocks
    jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(-1);
    config({ path: resolve(process.cwd(), 'src/second-app-init/external-checkpoint-flow/.env') });
    await cleanDataFolder('eventstore');
    db = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await db.connect();
  });

  afterEach(async () => {
    await db?.close().catch(() => {});
    jest.restoreAllMocks();
  });

  it('should rollback EventStore to external checkpoint when local write model is ahead', async () => {
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

    const [integrity] = await db.all(`PRAGMA integrity_check`);
    expect(integrity.integrity_check).toBe('ok');

    const rows = await db.all(`SELECT * FROM network ORDER BY id ASC`);

    // No events with blockHeight > 1 remain
    expect(rows.some((r: any) => r.blockHeight > 1)).toBe(false);
    expect(rows.some((r: any) => r.type === 'BitcoinNetworkBlocksAddedEvent' && r.blockHeight === 2)).toBe(false);
    expect(rows.some((r: any) => r.type === 'BitcoinNetworkBlocksAddedEvent' && r.blockHeight === 3)).toBe(false);

    const latest = rows[rows.length - 1];
    expect(latest.type).toBe('BitcoinNetworkInitializedEvent');
    expect(latest.blockHeight).toBe(1);
    expect(UUID_RE.test(latest.requestId)).toBe(true);
    expect(Number.isInteger(latest.timestamp)).toBe(true);
    expect(latest.timestamp).toBeGreaterThan(1e15);
  });

  it('should fail fast when external checkpoint is ahead of local EventStore', async () => {
    await seedNetworkTable(db, checkpointAheadNetworkEvents);
    await db.close();

    await expect(bootstrap({ config: { lastBlockHeight: 2 } })).rejects.toThrow(
      'External checkpoint (2) is ahead of local EventStore (0)'
    );
  });
});
