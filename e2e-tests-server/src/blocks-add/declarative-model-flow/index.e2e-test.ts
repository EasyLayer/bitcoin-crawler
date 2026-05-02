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

const LAST_MOCK_HEIGHT = mockBlocks[mockBlocks.length - 1]!.height; // 2
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(LAST_MOCK_HEIGHT);

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights')
  .mockImplementation(async (heights: (string | number)[]): Promise<any> => {
    const numHeights = heights.map(Number);
    return mockBlocks
      .filter((b: any) => numHeights.includes(Number(b.height)))
      .map((b: any) => ({ blockhash: b.hash, total_size: 1, height: b.height }));
  });

jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksByHeights').mockImplementation(
  async (heights: any[]): Promise<any[]> =>
    heights.map((h) => {
      const blk = mockBlocks.find((b) => b.height === Number(h));
      if (!blk) throw new Error(`No mock block for height ${h}`);
      return blk;
    })
);

function payloadToObject(p: any): any {
  if (p == null) return p;
  if (Buffer.isBuffer(p)) return JSON.parse(p.toString('utf8'));
  if (typeof p === 'string') return JSON.parse(p);
  return p;
}

describe('/Bitcoin Crawler: Add Blocks Flow (declarative model)', () => {
  let dbService!: SQLiteService;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    jest.resetModules();
    config({ path: resolve(process.cwd(), 'src/blocks-add/declarative-model-flow/.env') });
    await cleanDataFolder('eventstore');
    await bootstrap({
      Models: [BlocksModel],
      testing: {
        handlerEventsToWait: [{ eventType: BitcoinNetworkBlocksAddedEvent, count: mockBlocks.length }],
      },
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await dbService?.close().catch(() => {});
  });

  it('should save and verify Network Model events with correct payload structure', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    const [integrity] = await dbService.all(`PRAGMA integrity_check`);
    expect(integrity.integrity_check).toBe('ok');

    const events = await dbService.all(`SELECT * FROM network ORDER BY id ASC`);

    const initEvent = events.find((e: any) => e.type === BitcoinNetworkInitializedEvent.name);
    expect(initEvent).toBeDefined();
    expect(initEvent.version).toBe(1);
    expect(UUID_RE.test(initEvent.requestId)).toBe(true);
    expect(Number.isInteger(initEvent.timestamp)).toBe(true);
    expect(initEvent.timestamp).toBeGreaterThan(1e15);

    const blockEvents = events.filter((e: any) => e.type === BitcoinNetworkBlocksAddedEvent.name);
    expect(blockEvents.length).toBe(mockBlocks.length);

    blockEvents.forEach((ev: any, i: number) => {
      expect(Number(ev.blockHeight)).toBe(i);
      expect(Number(ev.version)).toBe(i + 2);
      const payload = payloadToObject(ev.payload);
      expect(Array.isArray(payload.blocks)).toBe(true);
      payload.blocks.forEach((b: any) => {
        expect(typeof b.height).toBe('number');
        expect(typeof b.hash).toBe('string');
        expect(Array.isArray(b.tx)).toBe(true);
        expect(b.tx.length).toBeGreaterThan(0);
        expect(b.hash).toBe(mockBlocks[b.height]!.hash);
      });
    });
  });

  it('should save and verify User Model events with correct payload structure', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    const events = await dbService.all(`SELECT * FROM ${AGGREGATE_ID} ORDER BY version ASC`);
    const userEvents = events.filter((e: any) => e.type === BlockAddedEvent.name);
    expect(userEvents.length).toBe(mockBlocks.length);

    userEvents.forEach((ev: any, i: number) => {
      expect(ev.version).toBe(i + 1);
      expect(ev.type).toBe('BlockAddedEvent');
      expect(Number(ev.blockHeight)).toBe(i);
      const payload = payloadToObject(ev.payload);
      expect(typeof payload.hash).toBe('string');
      expect(payload.hash).toBe(mockBlocks[i]!.hash);
    });
  });
});
