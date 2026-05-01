import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BitcoinMempoolInitializedEvent, BlockchainProviderService } from '@easylayer/bitcoin';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import type { MempoolRecord } from './mocks';
import { mempoolTableSQL, mockMempool } from './mocks';

// Prevent block loading (no concurrent writes with mempool init).
jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(-1);

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromMempool').mockResolvedValue(1504847);

jest.spyOn(BlockchainProviderService.prototype, 'getRawMempoolFromAll').mockResolvedValue([]);

jest.spyOn(BlockchainProviderService.prototype, 'getMempoolTransactionsByTxids').mockResolvedValue([]);

function escapeSqlString(s: string): string {
  return s.replace(/'/g, "''");
}

function bufferToHexLiteral(b: Buffer): string {
  return `X'${b.toString('hex')}'`;
}

describe('/Bitcoin Crawler: Second Initialization Only Mempool Flow', () => {
  let dbService!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();

    config({ path: resolve(process.cwd(), 'src/second-app-init/init-restore-mempool-flow/.env') });

    await cleanDataFolder('eventstore');

    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();
    await dbService.exec(mempoolTableSQL);

    for (const rec of mockMempool as MempoolRecord[]) {
      const payloadBuf = Buffer.from(JSON.stringify(rec.payload), 'utf8');
      const sql = `
        INSERT INTO mempool
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
      await dbService.exec(sql);
    }

    // IMPORTANT: close before bootstrap so the EventStore (locking_mode=EXCLUSIVE)
    // doesn't compete with this connection → prevents SQLITE_BUSY.
    await dbService.close();

    await bootstrap({
      testing: {
        handlerEventsToWait: [{ eventType: BitcoinMempoolInitializedEvent, count: 1 }],
      },
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    if (dbService) {
      await dbService.close().catch(() => undefined as any);
    }
  });

  it('should init existing Mempool aggregate with valid new Initialized event', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    const rows = await dbService.all(`
      SELECT id, version, requestId, type, blockHeight
      FROM mempool
      WHERE type = 'BitcoinMempoolInitializedEvent'
      ORDER BY version DESC
      LIMIT 1
    `);

    expect(rows.length).toBe(1);
    expect(rows[0].version).toBe(3);
    expect(typeof rows[0].blockHeight).toBe('number');
    expect(rows[0].blockHeight).toBeGreaterThanOrEqual(mockMempool[0]!.blockHeight as number);
    expect(rows[0].type).toBe('BitcoinMempoolInitializedEvent');
  });
});
