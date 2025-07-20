import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { EventStatus } from '@easylayer/common/cqrs';
import { BitcoinNetworkInitializedEvent } from '@easylayer/bitcoin';
import { SQLiteService } from '../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import BlocksModel from './blocks.model';

describe('/Bitcoin Crawler: First Initializaton Flow', () => {
  let app: INestApplication | INestApplicationContext;
  let dbService!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.useRealTimers();
    jest.resetModules();
    // jest.useFakeTimers({ advanceTimers: true });

    // Load environment variables
    config({ path: resolve(process.cwd(), 'src/first-init-flow/.env') });

    // Clear the database
    await cleanDataFolder('eventstore');

    app = await bootstrap({
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

  it('should create Network aggregate', async () => {
    // Connect to the Event Store
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    // Check if the Network aggregate is created
    const events = await dbService.all(`SELECT * FROM network`);

    expect(events.length).toBe(1);
    expect(events[0].version).toBe(1);
    expect(events[0].type).toBe('BitcoinNetworkInitializedEvent');
    expect(events[0].blockHeight).toBe(-1);
  });
});
