import { BlockchainProviderService, BlockParserService } from '@easylayer/bitcoin';
import { mockBlocks } from './mocks';

BlockchainProviderService.prototype.getManyBlocksStatsByHeights = async function (
  heights: (string | number)[]
): Promise<any> {
  return mockBlocks
    .filter((b) => heights.includes(b.height))
    .map((b) => ({
      blockhash: b.hash,
      total_size: 1,
      height: b.height,
    }));
};

BlockchainProviderService.prototype.getManyBlocksByHashes = async function (hashes: string[]): Promise<any> {
  // return mockBlocks.filter(b => hashes.includes(b.hash));
  return hashes.map((hash) => {
    const blk = mockBlocks.find((b) => b.hash === hash);
    if (!blk) throw new Error(`No mock block for hash ${hash}`);
    return JSON.stringify(blk);
  });
};

BlockParserService['parseRawBlock'] = (raw: string, height: number) => {
  const blk = JSON.parse(raw);
  if (blk.height !== height) {
    throw new Error(`Height mismatch: ${blk.height} vs ${height}`);
  }
  return blk;
};
