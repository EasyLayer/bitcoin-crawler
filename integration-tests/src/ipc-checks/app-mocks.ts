import { BlockchainProviderService } from '@easylayer/bitcoin';
import { mockBlocks } from './mocks';

// Mock implementation for getting blocks by heights
BlockchainProviderService.prototype.getManyBlocksByHeights = async function (heights: any[]): Promise<any> {
  return mockBlocks;
};
