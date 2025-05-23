// eslint-disable-next-line no-console
console.log('[app-mocks] LOADED from', __filename);

import { BlockchainProviderService, BlockParserService } from '@easylayer/bitcoin';
import { mockBlocks } from './mocks';

// Mock implementation for getting block stats
BlockchainProviderService.prototype.getManyBlocksStatsByHeights = async function (
  heights: (string | number)[]
): Promise<any> {
  // eslint-disable-next-line no-console
  console.log('Mock getManyBlocksStatsByHeights called with heights:', heights);
  const result = mockBlocks
    .filter((b) => heights.includes(b.height))
    .map((b) => ({
      blockhash: b.hash,
      total_size: 1,
      height: b.height,
    }));
  // eslint-disable-next-line no-console
  console.log('Mock getManyBlocksStatsByHeights returning:', result);
  return result;
};

// Mock implementation for getting blocks by hashes
BlockchainProviderService.prototype.getManyBlocksByHashes = async function (hashes: string[]): Promise<any> {
  // eslint-disable-next-line no-console
  console.log('Mock getManyBlocksByHashes called with hashes:', hashes);
  const result = hashes.map((hash) => {
    const blk = mockBlocks.find((b) => b.hash === hash);
    if (!blk) {
      // eslint-disable-next-line no-console
      console.error(`No mock block found for hash ${hash}`);
      throw new Error(`No mock block for hash ${hash}`);
    }
    return JSON.stringify(blk);
  });
  // eslint-disable-next-line no-console
  console.log('Mock getManyBlocksByHashes returning:', result);
  return result;
};

// Mock implementation for parsing raw blocks
BlockParserService['parseRawBlock'] = (raw: string, height: number) => {
  // eslint-disable-next-line no-console
  console.log('Mock parseRawBlock called with height:', height);
  const blk = JSON.parse(raw);
  if (blk.height !== height) {
    // eslint-disable-next-line no-console
    console.error(`Height mismatch: ${blk.height} vs ${height}`);
    throw new Error(`Height mismatch: ${blk.height} vs ${height}`);
  }
  // eslint-disable-next-line no-console
  console.log('Mock parseRawBlock returning:', blk);
  return blk;
};
