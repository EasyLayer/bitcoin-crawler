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

const LAST_MOCK_HEIGHT = Math.max(
  ...mockFakeChainBlocks.map((b: any) => Number(b.height)),
  ...mockRealChainBlocks.map((b: any) => Number(b.height))
); // 3

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let useReal = false;
const pickSrc = () => (useReal ? mockRealChainBlocks : mockFakeChainBlocks);

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(LAST_MOCK_HEIGHT);

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
    return pickSrc()
      .filter((b: any) => hs.includes(Number(b.height)))
      .map((b: any) => ({ blockhash: b.hash, total_size: b.size, height: Number(b.height) }));
  });

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksByHeights')
  .mockImplementation(async (heights: (string | number)[]): Promise<any[]> => {
    const hs = heights.map(Number);
    return hs.map((h) => {
      const blk = pickSrc().find((b: any) => Number(b.height) === h);
      if (!blk) throw new Error(`No mock block for height ${h}`);
      return blk;
    });
  });

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
    config({ path: resolve(process.cwd(), 'src/reorganisation/.env') });
    await cleanDataFolder('eventstore');
    await bootstrap({
      Models: [BlocksModel],
      testing: {
        handlerEventsToWait: [{ eventType: BitcoinNetworkBlocksAddedEvent, count: waitingEventCount }],
      },
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await dbService?.close().catch(() => {});
  });

  it('should truncate reorganisation blocks from Network Model', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    const [integrity] = await dbService.all(`PRAGMA integrity_check`);
    expect(integrity.integrity_check).toBe('ok');

    const events = await dbService.all(`SELECT * FROM network ORDER BY id ASC`);

    // Sequence: Init → BlocksAdded×3(fake) → Reorganized → BlocksAdded×1(real)
    const allTypes = events.map((e: any) => e.type);
    expect(allTypes[0]).toBe('BitcoinNetworkInitializedEvent');
    const reorgIdx = allTypes.indexOf('BitcoinNetworkReorganizedEvent');
    expect(reorgIdx).toBeGreaterThan(0);
    expect(allTypes.slice(reorgIdx + 1)).toContain('BitcoinNetworkBlocksAddedEvent');

    // All events have valid UUID requestId
    events.forEach((ev: any) => {
      expect(UUID_RE.test(ev.requestId)).toBe(true);
      expect(Number.isInteger(ev.timestamp)).toBe(true);
      expect(ev.timestamp).toBeGreaterThan(1e15);
    });

    const initEvent = events.find((e: any) => e.type === BitcoinNetworkInitializedEvent.name);
    expect(initEvent).toBeDefined();

    const reorgEvents = events.filter((e: any) => e.type === BitcoinNetworkReorganizedEvent.name);
    expect(reorgEvents.length).toBe(1);
    const reorgEvent = reorgEvents[0];
    expect(reorgEvent.blockHeight).toBe(reorgBlock.height);
    expect(reorgEvent.version).toBe(5);

    const reorgPayload = payloadToObject(reorgEvent.payload);
    expect(reorgPayload.blocks[0].height).toBe(2);
    expect(reorgPayload.blocks[1].height).toBe(1);
    // Hashes match fake chain (rolled back blocks)
    expect(reorgPayload.blocks[0].hash).toBe(mockFakeChainBlocks.find((b: any) => b.height === 2)!.hash);
    expect(reorgPayload.blocks[1].hash).toBe(mockFakeChainBlocks.find((b: any) => b.height === 1)!.hash);

    const blockEvents = events.filter((e: any) => e.type === BitcoinNetworkBlocksAddedEvent.name);
    expect(blockEvents.length).toBe(4);

    // Blocks before reorg (fake chain)
    expect(blockEvents[0].blockHeight).toBe(0);
    expect(blockEvents[0].version).toBe(2);
    expect(blockEvents[1].blockHeight).toBe(1);
    expect(blockEvents[1].version).toBe(3);
    expect(blockEvents[2].blockHeight).toBe(2);
    expect(blockEvents[2].version).toBe(4);

    // Block after reorg (real chain, height=1)
    expect(blockEvents[3].blockHeight).toBe(1);
    expect(blockEvents[3].version).toBe(6);

    // Payload hashes match mocks
    const afterPayload = payloadToObject(blockEvents[3].payload);
    expect(afterPayload.blocks[0].hash).toBe(mockRealChainBlocks.find((b: any) => b.height === 1)!.hash);
    expect(afterPayload.blocks[0].hash).not.toBe(mockFakeChainBlocks.find((b: any) => b.height === 1)!.hash);

    [blockEvents[0], blockEvents[1], blockEvents[2], blockEvents[3]].forEach((ev: any) => {
      const p = payloadToObject(ev.payload);
      expect(Array.isArray(p.blocks)).toBe(true);
      p.blocks.forEach((b: any) => {
        expect(typeof b.hash).toBe('string');
        expect(b.hash.length).toBeGreaterThan(0);
        expect(Array.isArray(b.tx)).toBe(true);
        expect(b.tx.length).toBeGreaterThan(0);
      });
    });
  });

  it('should rollback reorganisation blocks from Users Model', async () => {
    dbService = new SQLiteService({ path: resolve(process.cwd(), 'eventstore/bitcoin.db') });
    await dbService.connect();

    const events = await dbService.all(`SELECT * FROM ${AGGREGATE_ID} ORDER BY version ASC`);
    const userEvents = events.filter((e: any) => e.type === BlockAddedEvent.name);
    expect(userEvents.length).toBe(2);

    const blockBeforeReorg = userEvents[0];
    const blockAfterReorg = userEvents[1];

    expect(blockBeforeReorg.blockHeight).toBe(reorgBlock.height); // 0
    expect(blockBeforeReorg.version).toBe(1);

    expect(blockAfterReorg.blockHeight).toBe(1);
    expect(blockAfterReorg.version).toBe(2);

    // Payload hashes
    const payload0 = payloadToObject(blockBeforeReorg.payload);
    expect(payload0.hash).toBe(reorgBlock.hash);

    const payloadAfter = payloadToObject(blockAfterReorg.payload);
    expect(payloadAfter.hash).toBe(mockRealChainBlocks.find((b: any) => b.height === 1)!.hash);
    expect(payloadAfter.hash).not.toBe(mockFakeChainBlocks.find((b: any) => b.height === 1)!.hash);
  });
});
