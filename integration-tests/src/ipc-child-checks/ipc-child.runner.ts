import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BlockchainProviderService } from '@easylayer/bitcoin';
import BlocksModel from './blocks.model';
import { mockBlocks } from './mocks';

BlockchainProviderService.prototype.getManyBlocksStatsByHeights = async function (heights: any[]): Promise<any> {
  return mockBlocks
    .filter((block: any) => heights.includes(block.height))
    .map((block: any) => ({ blockhash: block.hash, total_size: 1, height: block.height }));
};

BlockchainProviderService.prototype.getManyBlocksByHeights = async function (heights: any[]): Promise<any> {
  return heights.map((height) => {
    const blk = mockBlocks.find((b) => b.height === height);
    if (!blk) throw new Error(`No mock block for height ${height}`);
    return blk;
  });
};

(async () => {
  await bootstrap({ Models: [BlocksModel] });
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
