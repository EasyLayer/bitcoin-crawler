import { resolve } from 'node:path';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/bitcoin-crawler';
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

let useReal = false;

const pickSrc = () => (useReal ? mockRealChainBlocks : mockFakeChainBlocks);

jest
  .spyOn(BlockchainProviderService.prototype, 'getBasicBlockByHeight')
  .mockImplementation(async (height: string | number): Promise<any> => {
    const h = Number(height);
    if (h >= 2) useReal = true;
    return pickSrc().find((b: any) => Number(b.height) === h) ?? null;
  });

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights')
  .mockImplementation(async (heights: (string | number)[]): Promise<any[]> => {
    const hs = heights.map(Number);
    const src = pickSrc();
    return src
      .filter((b: any) => hs.includes(Number(b.height)))
      .map((b: any) => ({
        blockhash: b.hash,
        total_size: b.size ?? 1,
        height: Number(b.height),
      }));
  });

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksByHeights')
  .mockImplementation(
    async (
      heights: (string | number)[],
      _useHex?: boolean,
      _verbosity?: number,
      _verifyMerkle?: boolean
    ): Promise<any[]> => {
      const hs = heights.map(Number);
      const src = pickSrc();
      return hs.map((h) => {
        const blk = src.find((b: any) => Number(b.height) === h);
        if (!blk) throw new Error(`No mock block for height ${h}`);
        return blk;
      });
    }
  );

function payloadToObject(p: any): any {
  if (p == null) return p;
  if (Buffer.isBuffer(p)) return JSON.parse(p.toString('utf8'));
  if (typeof p === 'string') return JSON.parse(p);
  return p;
}

describe('/Bitcoin Crawler: Reorganisation Flow', () => {
  const waitingEventCount = 4;
  let dbService!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();
    jest.useFakeTimers({ advanceTimers: true });

    config({ path: resolve(process.cwd(), 'src/reorganisation/.env') });

    await cleanDataFolder('eventstore');

    await bootstrap({
      Models: [BlocksModel],
      testing: {
        handlerEventsToWait: [{ eventType: BitcoinNetworkBlocksAddedEvent, count: waitingEventCount }],
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
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    const events = await dbService.all(`SELECT * FROM network ORDER BY id ASC`);

    const initEvent = events.find((event: any) => event.type === BitcoinNetworkInitializedEvent.name);
    expect(initEvent).toBeDefined();

    const reorgEvents = events.filter((event: any) => event.type === BitcoinNetworkReorganizedEvent.name);
    expect(reorgEvents.length).toBe(1);
    const reorgEvent = reorgEvents[0];
    expect(reorgEvent.blockHeight).toBe(reorgBlock.height);
    expect(reorgEvent.version).toBe(5);
    const reorgEventPayload = payloadToObject(reorgEvent.payload);
    const reorgBlock2 = reorgEventPayload.blocks[0];
    const reorgBlock1 = reorgEventPayload.blocks[1];
    expect(reorgBlock2.height).toBe(2);
    expect(reorgBlock1.height).toBe(1);

    const blockEvents = events.filter((event: any) => event.type === BitcoinNetworkBlocksAddedEvent.name);
    expect(blockEvents.length).toBe(4);

    const blockBeforeReorg1 = blockEvents[0];
    expect(blockBeforeReorg1.blockHeight).toBe(0);
    expect(blockBeforeReorg1.version).toBe(2);
    const blockBeforeReorg1Payload = payloadToObject(blockBeforeReorg1.payload);
    expect(Array.isArray(blockBeforeReorg1Payload.blocks)).toBe(true);
    expect(blockBeforeReorg1Payload.blocks[0].height).toBe(0);
    expect(blockBeforeReorg1Payload.blocks[0].tx).toBeDefined();
    expect(blockBeforeReorg1Payload.blocks[0].tx.length).toBeGreaterThan(0);

    const blockBeforeReorg2 = blockEvents[1];
    expect(blockBeforeReorg2.blockHeight).toBe(1);
    expect(blockBeforeReorg2.version).toBe(3);
    const blockBeforeReorg2Payload = payloadToObject(blockBeforeReorg2.payload);
    expect(Array.isArray(blockBeforeReorg2Payload.blocks)).toBe(true);
    expect(blockBeforeReorg2Payload.blocks[0].height).toBe(1);
    expect(blockBeforeReorg2Payload.blocks[0].tx).toBeDefined();
    expect(blockBeforeReorg2Payload.blocks[0].tx.length).toBeGreaterThan(0);

    const blockBeforeReorg3 = blockEvents[2];
    expect(blockBeforeReorg3.blockHeight).toBe(2);
    expect(blockBeforeReorg3.version).toBe(4);
    const blockBeforeReorg3Payload = payloadToObject(blockBeforeReorg3.payload);
    expect(Array.isArray(blockBeforeReorg3Payload.blocks)).toBe(true);
    expect(blockBeforeReorg3Payload.blocks[0].height).toBe(2);
    expect(blockBeforeReorg3Payload.blocks[0].tx).toBeDefined();
    expect(blockBeforeReorg3Payload.blocks[0].tx.length).toBeGreaterThan(0);

    const blockAfterReorg = blockEvents[3];
    expect(blockAfterReorg.blockHeight).toBe(1);
    expect(blockAfterReorg.version).toBe(6);
    const blockAfterReorgPayload = payloadToObject(blockAfterReorg.payload);
    expect(Array.isArray(blockAfterReorgPayload.blocks)).toBe(true);
    expect(blockAfterReorgPayload.blocks[0].height).toBe(1);
    expect(blockAfterReorgPayload.blocks[0].tx).toBeDefined();
    expect(blockAfterReorgPayload.blocks[0].tx.length).toBeGreaterThan(0);
  });

  it('should rollback reorganisation blocks from Users Model', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    const events = await dbService.all(`SELECT * FROM ${AGGREGATE_ID} ORDER BY version ASC`);

    const userEvents = events.filter((event: any) => event.type === BlockAddedEvent.name);
    expect(userEvents.length).toBe(2);

    const blockBeforeReorg = userEvents[0];
    const blockAfterReorg = userEvents[1];

    expect(blockBeforeReorg.blockHeight).toBe(reorgBlock.height);
    expect(blockBeforeReorg.version).toBe(1);

    expect(blockAfterReorg.blockHeight).toBe(1);
    expect(blockAfterReorg.version).toBe(2);
  });
});
