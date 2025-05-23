import { BlockchainProviderService, BlockParserService } from '@easylayer/bitcoin';
import { mockBlocks } from './mocks';

BlockchainProviderService.prototype.getManyBlocksStatsByHeights = async function (
  heights: (string | number)[]
): Promise<any> {
  const result = mockBlocks
    .filter((b) => heights.includes(b.height))
    .map((b) => ({
      blockhash: b.hash,
      total_size: 1,
      height: b.height,
    }));
  return result;
};

// Mock implementation for getting blocks by hashes
BlockchainProviderService.prototype.getManyBlocksByHashes = async function (hashes: string[]): Promise<any> {
  const result = hashes.map((hash) => {
    const blk = mockBlocks.find((b) => b.hash === hash);
    if (!blk) {
      throw new Error(`No mock block for hash ${hash}`);
    }
    return JSON.stringify(blk);
  });
  return result;
};

BlockParserService['parseRawBlock'] = (raw: string, height: number) => {
  const blk = JSON.parse(raw);
  if (blk.height !== height) {
    throw new Error(`Height mismatch: ${blk.height} vs ${height}`);
  }
  return blk;
};
