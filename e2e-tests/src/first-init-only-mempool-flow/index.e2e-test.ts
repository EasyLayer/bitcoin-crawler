import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BitcoinMempoolInitializedEvent } from '@easylayer/bitcoin';
import { SQLiteService } from '../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../+helpers/clean-data-folder';

describe('/Bitcoin Crawler: First Initializaton Only Mempool Flow', () => {
  let app: INestApplication | INestApplicationContext;
  let dbService!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.useRealTimers();
    jest.resetModules();

    // Load environment variables
    config({ path: resolve(process.cwd(), 'src/first-init-only-mempool-flow/.env') });

    // Clear the database
    await cleanDataFolder('eventstore');

    app = await bootstrap({
      testing: {
        sagaEventsToWait: [
          {
            eventType: BitcoinMempoolInitializedEvent,
            count: 1,
          },
        ],
      },
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    if (dbService) {
      // eslint-disable-next-line no-console
      await dbService.close().catch(console.error);
    }

    // eslint-disable-next-line no-console
    await app?.close().catch(console.error);
  });

  it('should create Mempool aggregate', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    // Check if the Mempool aggregate is created
    const events = await dbService.all(`SELECT * FROM mempool`);

    // Due to fast saga execution, there might be additional events like BitcoinMempoolSyncProcessedEvent
    // We need to verify that BitcoinMempoolInitializedEvent exists
    const initEvent = events.find((event) => event.type === 'BitcoinMempoolInitializedEvent');

    expect(initEvent).toBeDefined();
    expect(initEvent.version).toBe(1);
  });

  it('should NOT create Network aggregate', async () => {
    // Connect to the Event Store
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    // Check if the Network aggregate is NOT created (table should be empty)
    const events = await dbService.all(`SELECT * FROM network`);
    expect(events.length).toBe(0);
  });
});
