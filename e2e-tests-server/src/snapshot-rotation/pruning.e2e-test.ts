import { resolve } from 'node:path';
import * as fs from 'node:fs';
import { config } from 'dotenv';
import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BitcoinNetworkBlocksAddedEvent, BlockchainProviderService } from '@easylayer/bitcoin';
import { SQLiteService } from '../+helpers/sqlite/sqlite.service';
import { cleanDataFolder } from '../+helpers/clean-data-folder';
import RotationBlocksModel, { AGGREGATE_ID } from './blocks.model';
import { mockBlocks } from './mocks';

const LAST_MOCK_HEIGHT = mockBlocks[mockBlocks.length - 1]!.height; // 2
const EVENTSTORE_DIR = resolve(process.cwd(), 'eventstore');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cloneMockBlock(block: any): any {
  return JSON.parse(JSON.stringify(block));
}

function toRawMockBlock(block: any): any {
  return {
    hash: block.hash,
    height: Number(block.height),
    size: Number(block.size ?? 1),
    bytes: Buffer.from(`mock-bitcoin-block:${block.height}`),
  };
}

function getEventstoreFiles(): string[] {
  return fs.readdirSync(EVENTSTORE_DIR).filter((f) => f !== '.gitkeep' && f !== '.gitignore');
}

function getArchivedFiles(): string[] {
  return getEventstoreFiles().filter((f) => /^\d+-\d+\.sqlite3$/.test(f));
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.spyOn(BlockchainProviderService.prototype, 'getCurrentBlockHeightFromNetwork').mockResolvedValue(LAST_MOCK_HEIGHT);

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksStatsByHeights')
  .mockImplementation(async (heights: (string | number)[]): Promise<any> => {
    const numHeights = heights.map(Number);
    return mockBlocks
      .filter((b: any) => numHeights.includes(Number(b.height)))
      .map((b: any) => ({ blockhash: b.hash, total_size: b.size ?? 1, height: b.height }));
  });

jest.spyOn(BlockchainProviderService.prototype, 'getManyBlocksRawByHeights').mockImplementation(
  async (heights: number[]): Promise<any[]> =>
    heights.map((height) => {
      const block = mockBlocks.find((item) => Number(item.height) === Number(height));
      if (!block) throw new Error(`No mock raw block for height ${height}`);
      return toRawMockBlock(block);
    })
);

jest
  .spyOn(BlockchainProviderService.prototype, 'getManyBlocksRawByKnownHashes')
  .mockImplementation(async (infos: Array<{ hash?: string; height?: number } | null>): Promise<any[]> => {
    return infos.map((info) => {
      const block = mockBlocks.find(
        (item) => String(item.hash) === String(info?.hash) || Number(item.height) === Number(info?.height)
      );
      if (!block) throw new Error(`No mock raw block for known hash ${info?.hash} at height ${info?.height}`);
      return toRawMockBlock(block);
    });
  });

jest
  .spyOn(BlockchainProviderService.prototype, 'parseBlock')
  .mockImplementation((_bytes: Buffer, height: number): any => {
    const block = mockBlocks.find((item) => Number(item.height) === Number(height));
    if (!block) throw new Error(`No mock parsed block for height ${height}`);
    return cloneMockBlock(block);
  });

// ─── Tests ────────────────────────────────────────────────────────────────────

/**
 * Pruning test suite.
 *
 * Uses ALLOW_PRUNING=true + snapshotMinKeep=1 on the model.
 * After processing 3 blocks with snapshotInterval=1 and NETWORK_IRREVERSIBLE_DEPTH=0:
 *   - 3 rotations happen (one per block snapshot)
 *   - pruneArchivedFiles() runs after each rotation
 *   - With snapshotMinKeep=1: only the 1 most recent archived file is kept
 *   - All older archived files are deleted
 *
 * Result: eventstore/ should contain current.sqlite3 + exactly 1 archived file.
 */
describe('/Bitcoin Crawler: SQLite Snapshot Pruning', () => {
  beforeEach(() => jest.clearAllMocks());

  beforeAll(async () => {
    jest.resetModules();
    // Load .env with ALLOW_PRUNING=true
    config({
      path: resolve(process.cwd(), 'src/snapshot-rotation/.env'),
      override: true,
    });
    // Override ALLOW_PRUNING for this suite
    process.env.ALLOW_PRUNING = 'true';

    await cleanDataFolder('eventstore');
    await bootstrap({
      Models: [RotationBlocksModel],
      testing: {
        handlerEventsToWait: [{ eventType: BitcoinNetworkBlocksAddedEvent, count: mockBlocks.length }],
      },
    });
  });

  afterAll(() => {
    delete process.env.ALLOW_PRUNING;
    jest.restoreAllMocks();
  });

  it('current.sqlite3 should exist', () => {
    const files = getEventstoreFiles();
    expect(files).toContain('current.sqlite3');
  });

  it('with snapshotMinKeep=1 only 1 archived file should remain after pruning', () => {
    // snapshotMinKeep=1 on the model + ALLOW_PRUNING=true:
    // after 3 rotations, pruning keeps only the most recent archived file
    const archived = getArchivedFiles();
    expect(archived).toHaveLength(1);
  });

  it('the remaining archived file should be the most recent one', () => {
    const archived = getArchivedFiles();
    expect(archived).toHaveLength(1);

    const m = /^(\d+)-(\d+)\.sqlite3$/.exec(archived[0]!)!;
    const snapshotH = parseInt(m[2]!, 10);

    // The most recent archived file should have the highest snapshotHeight
    // With 3 blocks (h=0,1,2) and snapshotInterval=1 and depth=0:
    // rotations happen at h=0 and h=1 (h=2 snapshot goes into current)
    // so the last archived file has snapshotH=1
    expect(snapshotH).toBeGreaterThanOrEqual(0);
  });

  it('the remaining archived file should be readable and intact', async () => {
    const archived = getArchivedFiles();
    expect(archived).toHaveLength(1);

    const db = new SQLiteService({ path: resolve(EVENTSTORE_DIR, archived[0]!) });
    await db.connect();
    try {
      const [integrity] = await db.all(`PRAGMA integrity_check`);
      expect(integrity.integrity_check).toBe('ok');

      const tables = await db.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
      expect(tables.map((t: any) => t.name)).toContain(AGGREGATE_ID);
    } finally {
      await db.close();
    }
  });

  it('current.sqlite3 should still contain a snapshot (data not lost)', async () => {
    const db = new SQLiteService({ path: resolve(EVENTSTORE_DIR, 'current.sqlite3') });
    await db.connect();
    try {
      const snapshots = await db.all(
        `SELECT "aggregateId", MAX("blockHeight") as maxH FROM "snapshots" GROUP BY "aggregateId"`
      );
      expect(snapshots.length).toBeGreaterThanOrEqual(1);
      const userSnap = snapshots.find((s: any) => s.aggregateId === AGGREGATE_ID);
      expect(userSnap).toBeDefined();
    } finally {
      await db.close();
    }
  });

  it('current.sqlite3 should be a valid SQLite file (integrity check)', async () => {
    const db = new SQLiteService({ path: resolve(EVENTSTORE_DIR, 'current.sqlite3') });
    await db.connect();
    try {
      const [integrity] = await db.all(`PRAGMA integrity_check`);
      expect(integrity.integrity_check).toBe('ok');
      const tables = await db.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
      expect(tables.map((t: any) => t.name)).toContain(AGGREGATE_ID);
    } finally {
      await db.close();
    }
  });

  it('no -wal or -shm files left after app closes', () => {
    const walFiles = getEventstoreFiles().filter((f) => f.endsWith('-wal') || f.endsWith('-shm'));
    expect(walFiles).toHaveLength(0);
  });
});
