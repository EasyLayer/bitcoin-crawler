import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BitcoinNetworkInitializedEvent } from '@easylayer/bitcoin';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import type { NetworkRecord } from './mocks';
import { networkTableSQL, mockNetworks } from './mocks';

function escapeSqlString(s: string): string {
  return s.replace(/'/g, "''");
}

function bufferToHexLiteral(b: Buffer): string {
  return `X'${b.toString('hex')}'`;
}

describe('/Bitcoin Crawler: Second Initializaton Only Network Flow', () => {
  let dbService!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();

    config({ path: resolve(process.cwd(), 'src/second-app-init/init-restore-network-flow/.env') });

    await cleanDataFolder('eventstore');

    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();
    await dbService.exec(networkTableSQL);

    for (const rec of mockNetworks as NetworkRecord[]) {
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
      await dbService.exec(sql);
    }

    await dbService.close();

    await bootstrap({
      testing: {
        handlerEventsToWait: [{ eventType: BitcoinNetworkInitializedEvent, count: 1 }],
      },
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    if (dbService) {
      await dbService.close().catch(() => undefined as any);
    }
  });

  it('should init exists Network aggregate with correct height', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    const events = await dbService.all(
      `SELECT id,version,requestId,type,blockHeight FROM network ORDER BY version ASC`
    );

    expect(events.length).toBe(3);
    expect(events[2].version).toBe(3);
    expect(events[2].blockHeight).toBe(mockNetworks[1]!.blockHeight);
    expect(events[2].type).toBe('BitcoinNetworkInitializedEvent');
  });
});
