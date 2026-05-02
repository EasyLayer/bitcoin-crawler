import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BitcoinNetworkInitializedEvent, BlockchainProviderService } from '@easylayer/bitcoin';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
import type { NetworkRecord } from './mocks';
import { networkTableSQL, mockNetworks } from './mocks';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(-1);

function escapeSqlString(s: string): string {
  return s.replace(/'/g, "''");
}
function bufferToHexLiteral(b: Buffer): string {
  return `X'${b.toString('hex')}'`;
}

describe('/Bitcoin Crawler: Second Initialization Only Network Flow', () => {
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
      await dbService.exec(`
        INSERT INTO network (version, requestId, type, payload, blockHeight, isCompressed, timestamp)
        VALUES (${rec.version}, '${escapeSqlString(rec.requestId)}', '${escapeSqlString(rec.type)}',
                ${bufferToHexLiteral(payloadBuf)},
                ${rec.blockHeight === null ? 'NULL' : rec.blockHeight},
                ${rec.isCompressed ?? 0}, ${rec.timestamp});
      `);
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
    await dbService?.close().catch(() => {});
  });

  it('should init existing Network aggregate with correct height', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    const events = await dbService.all(`SELECT * FROM network ORDER BY version ASC`);

    // 2 seed events + 1 new init = 3 total
    expect(events.length).toBe(3);

    // version increments correctly
    events.forEach((ev: any, i: number) => expect(ev.version).toBe(i + 1));

    const newInit = events[2];
    expect(newInit.type).toBe('BitcoinNetworkInitializedEvent');
    expect(newInit.blockHeight).toBe(mockNetworks[1]!.blockHeight);
    expect(UUID_RE.test(newInit.requestId)).toBe(true);
    expect(Number.isInteger(newInit.timestamp)).toBe(true);
    expect(newInit.timestamp).toBeGreaterThan(1e15);
  });
});
