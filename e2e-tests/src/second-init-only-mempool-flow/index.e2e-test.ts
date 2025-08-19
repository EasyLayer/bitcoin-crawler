import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BitcoinMempoolInitializedEvent } from '@easylayer/bitcoin';
import { SQLiteService } from '../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import type { MempoolRecord } from './mocks';
import { mempoolTableSQL, mockMempool } from './mocks';

describe('/Bitcoin Crawler: Second Initializaton Only Mempool Flow', () => {
  let dbService!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();
    jest.useFakeTimers({ advanceTimers: true });

    // Load environment variables
    config({ path: resolve(process.cwd(), 'src/second-init-only-mempool-flow/.env') });

    // Clear the database
    await cleanDataFolder('eventstore');

    // Initialize the write database
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();
    await dbService.exec(mempoolTableSQL);

    // Insert events into the write database
    for (const rec of mockMempool as MempoolRecord[]) {
      const vals = [
        rec.version,
        `'${rec.requestId}'`,
        `'${rec.status}'`,
        `'${rec.type}'`,
        `'${JSON.stringify(rec.payload).replace(/'/g, "''")}'`,
        rec.blockHeight,
      ].join(', ');

      await dbService.exec(`
        INSERT INTO mempool
          (version, requestId, status, type, payload, blockHeight)
        VALUES
          (${vals});
      `);
    }

    // Close the write database connection after inserting events
    await dbService.close();

    await bootstrap({
      testing: {
        sagaEventsToWait: [
          {
            eventType: BitcoinMempoolInitializedEvent,
            count: 1,
          },
        ],
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

  it('should init exists Mepool aggregate with correct height', async () => {
    // Connect to the Event Store
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    // Check if the Network aggregate is created
    const events = await dbService.all(`SELECT * FROM mempool`);

    expect(events.length).toBe(4);
    expect(events[2].version).toBe(3);
    expect(events[2].blockHeight).toBe(mockMempool[2]!.blockHeight);
    expect(events[0].type).toBe('BitcoinMempoolInitializedEvent');
  });
});
