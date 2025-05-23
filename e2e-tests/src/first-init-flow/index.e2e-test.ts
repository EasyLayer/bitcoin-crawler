import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { EventStatus } from '@easylayer/common/cqrs';
import { BitcoinNetworkInitializedEvent } from '@easylayer/bitcoin';
import { SQLiteService } from '../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import BlocksModel from './blocks.model';

describe('/Bitcoin Crawler: First Initializaton Flow', () => {
  let dbService!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();
    jest.useFakeTimers({ advanceTimers: true });

    // Load environment variables
    config({ path: resolve(process.cwd(), 'src/first-init-flow/.env') });

    // Clear the database
    await cleanDataFolder('eventstore');

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
    if (dbService) {
      // eslint-disable-next-line no-console
      await dbService.close().catch(console.error);
    }
  });

  it('should create Network aggregate', async () => {
    // Connect to the Event Store
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/data.db') });
    await dbService.connect();

    // Check if the Network aggregate is created
    const events = await dbService.all(`SELECT * FROM network`);

    expect(events.length).toBe(1);
    expect(events[0].version).toBe(1);
    expect(events[0].type).toBe('BitcoinNetworkInitializedEvent');
    expect(events[0].blockHeight).toBe(-1);
    expect(events[0].status).toBe(EventStatus.PUBLISHED);
  });
});
