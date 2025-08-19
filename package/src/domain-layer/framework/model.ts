import type { BlockchainProviderService } from '@easylayer/bitcoin';
import type { NetworkConfig, Block } from '@easylayer/bitcoin';
import { AggregateRoot } from '@easylayer/common/cqrs';
import type { NetworkModelFactoryService, MempoolModelFactoryService } from '../services';
import type { ModelFactoryService } from './factory';

export type ModelType = new () => Model;

export interface ExecutionContext {
  block: Block;
  mempool: MempoolModelFactoryService;
  networkConfig: NetworkConfig;
  services: {
    nodeProvider: BlockchainProviderService;
    networkModelService: NetworkModelFactoryService;
    // mempoolModelService: MempoolModelFactoryService,
    userModelService: ModelFactoryService;
  };
}

export abstract class Model extends AggregateRoot {
  public parseBlock(context: ExecutionContext): Promise<void> {
    throw new Error('method parseBlock() has to be implemented');
  }
}
