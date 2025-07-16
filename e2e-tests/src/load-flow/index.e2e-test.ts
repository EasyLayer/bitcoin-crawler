import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { EventStatus } from '@easylayer/common/cqrs';
import {
  BitcoinNetworkInitializedEvent,
  BitcoinNetworkBlocksAddedEvent,
  BlockchainProviderService,
} from '@easylayer//bitcoin';
import { SQLiteService } from '../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import BlocksModel, { AGGREGATE_ID, BlockAddedEvent } from './blocks.model';
import { mockBlocks } from './mocks';

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights')
  .mockImplementation(async (heights: (string | number)[]): Promise<any> => {
    return mockBlocks
      .filter((block: any) => heights.includes(block.height))
      .map((block: any) => ({
        blockhash: block.hash,
        total_size: 1,
        height: block.height,
      }));
  });

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksByHeights')
  .mockImplementation(async (heights: any[]): Promise<any[]> => {
    return heights.map((height) => {
      const blk = mockBlocks.find((b) => b.height === height);
      if (!blk) throw new Error(`No mock block for hash ${height}`);
      return blk;
    });
  });

describe('/Bitcoin Crawler: Load Blocks Flow', () => {
  const waitingEventCount = 2;
  let dbService!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();
    jest.useFakeTimers({ advanceTimers: true });

    // Load environment variables
    config({ path: resolve(process.cwd(), 'src/load-flow/.env') });

    // Clear the database
    await cleanDataFolder('eventstore');

    await bootstrap({
      Models: [BlocksModel],
      testing: {
        handlerEventsToWait: [
          {
            eventType: BitcoinNetworkBlocksAddedEvent,
            count: waitingEventCount,
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

  it('should save and verify Network Model events with correct payload structure', async () => {
    // Connect to the Event Stores
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/data.db') });
    await dbService.connect();

    // Retrieve all events from the network table
    const events = await dbService.all(`SELECT * FROM network`);

    // Check init event
    const initEvent = events.find((event) => event.type === BitcoinNetworkInitializedEvent.name);
    expect(initEvent).toBeDefined();

    // Check the block added events (BitcoinNetworkBlocksAddedEvent)
    const blockEvents = events.filter((event) => event.type === BitcoinNetworkBlocksAddedEvent.name);
    expect(blockEvents.length).toBe(waitingEventCount);

    blockEvents.forEach((event) => {
      expect(event.status).toBe(EventStatus.PUBLISHED);

      const blockPayload = JSON.parse(event.payload);

      // Check that the blocks are present in the payload
      expect(blockPayload.blocks).toBeDefined();

      // Verify that blocks are in array format
      expect(Array.isArray(blockPayload.blocks)).toBe(true);

      blockPayload.blocks.forEach((block: any) => {
        // Verify the block height is defined
        expect(block.height).toBeDefined();

        // Verify the block hash is defined
        expect(block.hash).toBeDefined();

        // Ensure transactions are present in the block
        expect(block.tx).toBeDefined();

        // Check that the block contains transactions
        expect(block.tx.length).toBeGreaterThan(0);
      });
    });
  });

  it('should save and verify User Models events with correct payload structure', async () => {
    // Connect to the Event Stores
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/data.db') });
    await dbService.connect();

    // Retrieve all events from the user custom model table
    const events = await dbService.all(`SELECT * FROM ${AGGREGATE_ID}`);

    const userEvents = events.filter((event) => event.type === BlockAddedEvent.name);
    expect(userEvents.length).toBe(waitingEventCount);

    const firstEvent = userEvents[0];
    const secondEvent = userEvents[1];

    // Check block in first event
    expect(firstEvent.version).toBe(1);
    expect(firstEvent.type).toBe('BlockAddedEvent');
    expect(firstEvent.blockHeight).toBe(0);
    expect(firstEvent.status).toBe(EventStatus.PUBLISHED);

    // Check block in second event
    expect(secondEvent.version).toBe(2);
    expect(secondEvent.type).toBe('BlockAddedEvent');
    expect(secondEvent.blockHeight).toBe(1);
    expect(secondEvent.status).toBe(EventStatus.PUBLISHED);
  });
});
