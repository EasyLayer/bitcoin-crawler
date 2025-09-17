import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import {
  BitcoinNetworkInitializedEvent,
  BitcoinNetworkBlocksAddedEvent,
  BlockchainProviderService,
} from '@easylayer/bitcoin';
import { SQLiteService } from '../../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../../+helpers/clean-data-folder';
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
      if (!blk) throw new Error(`No mock block for height ${height}`);
      return blk;
    });
  });

function payloadToObject(p: any): any {
  if (p == null) return p;
  if (Buffer.isBuffer(p)) return JSON.parse(p.toString('utf8'));
  if (typeof p === 'string') return JSON.parse(p);
  return p;
}

describe('/Bitcoin Crawler: Add Blocks Flow (class model)', () => {
  let dbService!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();
    jest.useFakeTimers({ advanceTimers: true });

    config({ path: resolve(process.cwd(), 'src/blocks-add/class-model-flow/.env') });

    await cleanDataFolder('eventstore');

    await bootstrap({
      Models: [BlocksModel],
      testing: {
        handlerEventsToWait: [{ eventType: BitcoinNetworkBlocksAddedEvent, count: mockBlocks.length }],
      },
    });

    jest.runAllTimers();
  });

  afterAll(async () => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (dbService) {
      await dbService.close().catch(() => undefined as any);
    }
  });

  it('should save and verify Network Model events with correct payload structure', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    const events = await dbService.all(`SELECT * FROM network ORDER BY id ASC`);

    const initEvent = events.find((event: any) => event.type === BitcoinNetworkInitializedEvent.name);
    expect(initEvent).toBeDefined();

    const blockEvents = events.filter((event: any) => event.type === BitcoinNetworkBlocksAddedEvent.name);
    expect(blockEvents.length).toBe(mockBlocks.length);

    blockEvents.forEach((event: any) => {
      const blockPayload = payloadToObject(event.payload);
      expect(blockPayload.blocks).toBeDefined();
      expect(Array.isArray(blockPayload.blocks)).toBe(true);

      blockPayload.blocks.forEach((block: any) => {
        expect(block.height).toBeDefined();
        expect(block.hash).toBeDefined();
        expect(block.tx).toBeDefined();
        expect(Array.isArray(block.tx)).toBe(true);
        expect(block.tx.length).toBeGreaterThan(0);
      });
    });
  });

  it('should save and verify User Models events with correct payload structure', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    const events = await dbService.all(`SELECT * FROM ${AGGREGATE_ID} ORDER BY version ASC`);

    const userEvents = events.filter((event: any) => event.type === BlockAddedEvent.name);
    expect(userEvents.length).toBe(mockBlocks.length);

    const firstEvent = userEvents[0];
    const secondEvent = userEvents[1];
    const thirdEvent = userEvents[2];

    expect(firstEvent.version).toBe(1);
    expect(firstEvent.type).toBe('BlockAddedEvent');
    expect(firstEvent.blockHeight).toBe(0);

    expect(secondEvent.version).toBe(2);
    expect(secondEvent.type).toBe('BlockAddedEvent');
    expect(secondEvent.blockHeight).toBe(1);

    expect(thirdEvent.version).toBe(3);
    expect(thirdEvent.type).toBe('BlockAddedEvent');
    expect(thirdEvent.blockHeight).toBe(2);
  });
});
