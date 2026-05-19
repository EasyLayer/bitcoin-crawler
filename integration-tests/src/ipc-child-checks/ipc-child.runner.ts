import { bootstrap } from '@easylayer/bitcoin-crawler';
import { BlockchainProviderService } from '@easylayer/bitcoin';
import BlocksModel from './blocks.model';
import { mockBlocks } from './mocks';

const LAST_MOCK_HEIGHT = mockBlocks[mockBlocks.length - 1]!.height;

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

BlockchainProviderService.prototype.getCurrentBlockHeightFromNetwork = async function (): Promise<number> {
  return LAST_MOCK_HEIGHT;
};

BlockchainProviderService.prototype.getManyBlocksStatsByHeights = async function (heights: any[]): Promise<any> {
  const requestedHeights = heights.map(Number);
  return mockBlocks
    .filter((block: any) => requestedHeights.includes(Number(block.height)))
    .map((block: any) => ({ blockhash: block.hash, total_size: block.size ?? 1, height: block.height }));
};

BlockchainProviderService.prototype.getManyBlocksRawByHeights = async function (heights: number[]): Promise<any[]> {
  return heights.map((height) => {
    const block = mockBlocks.find((item) => Number(item.height) === Number(height));
    if (!block) throw new Error(`No mock raw block for height ${height}`);
    return toRawMockBlock(block);
  });
};

BlockchainProviderService.prototype.parseBlock = function (_bytes: Buffer, height: number): any {
  const block = mockBlocks.find((item) => Number(item.height) === Number(height));
  if (!block) throw new Error(`No mock parsed block for height ${height}`);
  return cloneMockBlock(block);
};

(async () => {
  await bootstrap({ Models: [BlocksModel] });
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
