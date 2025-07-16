import { BlockchainProviderService } from '@easylayer/bitcoin';
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

// Mock implementation for getting blocks by heights
BlockchainProviderService.prototype.getManyBlocksByHeights = async function (heights: any[]): Promise<any> {
  const result = heights.map((height) => {
    const blk = mockBlocks.find((b) => b.height === height);
    if (!blk) {
      throw new Error(`No mock block for height ${height}`);
    }
    return blk;
  });
  return result;
};
