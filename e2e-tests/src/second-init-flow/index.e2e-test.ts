import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BitcoinNetworkInitializedEvent } from '@easylayer/bitcoin';
import { SQLiteService } from '../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import BlocksModel from '../first-init-flow/blocks.model';
import type { NetworkRecord } from './mocks';
import { networkTableSQL, mockNetworks } from './mocks';

describe('/Bitcoin Crawler: Second Initializaton Flow', () => {
  let dbService!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();
    jest.useFakeTimers({ advanceTimers: true });

    // Load environment variables
    config({ path: resolve(process.cwd(), 'src/second-init-flow/.env') });

    // Clear the database
    await cleanDataFolder('eventstore');

    // Initialize the write database
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/data.db') });
    await dbService.connect();
    await dbService.exec(networkTableSQL);

    // Insert events into the write database
    for (const rec of mockNetworks as NetworkRecord[]) {
      const vals = [
        rec.version,
        `'${rec.requestId}'`,
        `'${rec.status}'`,
        `'${rec.type}'`,
        `'${JSON.stringify(rec.payload).replace(/'/g, "''")}'`,
        rec.blockHeight,
      ].join(', ');

      await dbService.exec(`
        INSERT INTO network
          (version, requestId, status, type, payload, blockHeight)
        VALUES
          (${vals});
      `);
    }

    // Close the write database connection after inserting events
    await dbService.close();

    await bootstrap({
      Models: [BlocksModel],
      testing: {
        handlerEventsToWait: [
          {
            eventType: BitcoinNetworkInitializedEvent,
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

  it('should init exists Network aggregate with correct height', async () => {
    // Connect to the Event Store
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/data.db') });
    await dbService.connect();

    // Check if the Network aggregate is created
    const events = await dbService.all(`SELECT * FROM network`);

    expect(events.length).toBe(3);
    expect(events[2].version).toBe(3);
    expect(events[2].blockHeight).toBe(mockNetworks[1]!.blockHeight);
    expect(events[2].type).toBe('BitcoinNetworkInitializedEvent');
  });
});
