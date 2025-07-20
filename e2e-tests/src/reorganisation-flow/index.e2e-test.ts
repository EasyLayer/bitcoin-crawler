import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { EventStatus } from '@easylayer/common/cqrs';
import {
  BitcoinNetworkInitializedEvent,
  BitcoinNetworkBlocksAddedEvent,
  BitcoinNetworkReorganizedEvent,
  BlockchainProviderService,
} from '@easylayer/bitcoin';
import { SQLiteService } from '../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import BlocksModel, { AGGREGATE_ID, BlockAddedEvent } from './blocks.model';
import { reorgBlock, mockFakeChainBlocks, mockRealChainBlocks } from './mocks';

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights')
  .mockImplementation(async (heights: (string | number)[]): Promise<any> => {
    return mockFakeChainBlocks
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
      const blk = mockFakeChainBlocks.find((b) => b.height === height);
      if (!blk) throw new Error(`No mock block for hash ${height}`);
      return blk;
    });
  });

jest
  .spyOn(BlockchainProviderService.prototype, 'getBasicBlockByHeight')
  .mockImplementation(async (height): Promise<any> => {
    return mockRealChainBlocks.find((block: any) => block.height === height);
  });

describe('/Bitcoin Crawler: Reorganisation Flow', () => {
  const waitingEventCount = 4;
  let dbService!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();
    jest.useFakeTimers({ advanceTimers: true });

    // Load environment variables
    config({ path: resolve(process.cwd(), 'src/reorganisation-flow/.env') });

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

  it('should truncate reorganisation blocks from Network Model', async () => {
    // Connect to the Event Stores
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    // Retrieve all events from the network table
    const events = await dbService.all(`SELECT * FROM network`);

    // Check init event
    const initEvent = events.find((event) => event.type === BitcoinNetworkInitializedEvent.name);
    expect(initEvent).toBeDefined();
    expect(initEvent.status).toBe(EventStatus.PUBLISHED);

    // Check the block reorg event (BitcoinNetworkReorganizedEvent)
    const reorgEvents = events.filter((event) => event.type === BitcoinNetworkReorganizedEvent.name);
    expect(reorgEvents.length).toBe(1);
    const reorgEvent = reorgEvents[0];
    expect(reorgEvent.blockHeight).toBe(reorgBlock.height);
    expect(reorgEvent.version).toBe(5);
    expect(reorgEvent.status).toBe(EventStatus.PUBLISHED);
    const reorgEventPayload = JSON.parse(reorgEvent.payload);
    const reorgBlock2 = reorgEventPayload.blocks[0];
    const reorgBlock1 = reorgEventPayload.blocks[1];
    expect(reorgBlock2.height).toBe(2);
    expect(reorgBlock1.height).toBe(1);

    // Check the block added events (BitcoinNetworkBlocksAddedEvent)
    const blockEvents = events.filter((event) => event.type === BitcoinNetworkBlocksAddedEvent.name);
    // add 1 block, add 2 block, add 3 block , reorg to block 1 (without removing 3,2 blocks), add new 2 block = 4 events
    expect(blockEvents.length).toBe(4);

    // 1 block
    const blockBeforeReorg1 = blockEvents[0];
    expect(blockBeforeReorg1.blockHeight).toBe(0);
    expect(blockBeforeReorg1.version).toBe(2);
    expect(blockBeforeReorg1.status).toBe(EventStatus.PUBLISHED);
    const blockBeforeReorg1Payload = JSON.parse(blockBeforeReorg1.payload);
    expect(Array.isArray(blockBeforeReorg1Payload.blocks)).toBe(true);
    expect(blockBeforeReorg1Payload.blocks[0].height).toBe(0);
    expect(blockBeforeReorg1Payload.blocks[0].tx).toBeDefined();
    expect(blockBeforeReorg1Payload.blocks[0].tx.length).toBeGreaterThan(0);

    // 2 block
    const blockBeforeReorg2 = blockEvents[1];
    expect(blockBeforeReorg2.blockHeight).toBe(1);
    expect(blockBeforeReorg2.version).toBe(3);
    expect(blockBeforeReorg2.status).toBe(EventStatus.PUBLISHED);
    const blockBeforeReorg2Payload = JSON.parse(blockBeforeReorg2.payload);
    expect(Array.isArray(blockBeforeReorg2Payload.blocks)).toBe(true);
    expect(blockBeforeReorg2Payload.blocks[0].height).toBe(1);
    expect(blockBeforeReorg2Payload.blocks[0].tx).toBeDefined();
    expect(blockBeforeReorg2Payload.blocks[0].tx.length).toBeGreaterThan(0);

    // 3 block
    const blockBeforeReorg3 = blockEvents[2];
    expect(blockBeforeReorg3.blockHeight).toBe(2);
    expect(blockBeforeReorg3.version).toBe(4);
    expect(blockBeforeReorg3.status).toBe(EventStatus.PUBLISHED);
    const blockBeforeReorg3Payload = JSON.parse(blockBeforeReorg3.payload);
    expect(Array.isArray(blockBeforeReorg3Payload.blocks)).toBe(true);
    expect(blockBeforeReorg3Payload.blocks[0].height).toBe(2);
    expect(blockBeforeReorg3Payload.blocks[0].tx).toBeDefined();
    expect(blockBeforeReorg3Payload.blocks[0].tx.length).toBeGreaterThan(0);

    // 4 block
    const blockAfterReorg = blockEvents[3];
    expect(blockAfterReorg.blockHeight).toBe(1);
    expect(blockAfterReorg.version).toBe(6);
    expect(blockAfterReorg.status).toBe(EventStatus.PUBLISHED);
    const blockAfterReorgPayload = JSON.parse(blockAfterReorg.payload);
    expect(Array.isArray(blockAfterReorgPayload.blocks)).toBe(true);
    expect(blockAfterReorgPayload.blocks[0].height).toBe(1);
    expect(blockAfterReorgPayload.blocks[0].tx).toBeDefined();
    expect(blockAfterReorgPayload.blocks[0].tx.length).toBeGreaterThan(0);
  });

  it('should rollback reorganisation blocks from Users Model', async () => {
    // Connect to the Event Stores
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    // Retrieve all events from the user custom model table
    const events = await dbService.all(`SELECT * FROM ${AGGREGATE_ID}`);

    const userEvents = events.filter((event) => event.type === BlockAddedEvent.name);
    // add 1 block, add 2 block, add 3 block , reorg to block 1 (remove 3,2 blocks), add new 2 block = 2 events
    expect(userEvents.length).toBe(2);

    const blockBeforeReorg = userEvents[0];
    const blockAfterReorg = userEvents[1];

    // 1 block
    expect(blockBeforeReorg.blockHeight).toBe(reorgBlock.height);
    expect(blockBeforeReorg.version).toBe(1);

    // block after reorg (2 block)
    expect(blockAfterReorg.blockHeight).toBe(1);
    expect(blockAfterReorg.version).toBe(2);
  });
});
