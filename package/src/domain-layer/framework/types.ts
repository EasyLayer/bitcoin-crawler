import type { ExecutionContext } from '@easylayer/common/framework';
import type { Block, NetworkConfig } from '@easylayer/bitcoin';
import type { MempoolModelFactoryService } from '../services';

export interface ProcessBlockExecutionContext extends ExecutionContext {
  block: Block;
  mempool: MempoolModelFactoryService;
  networkConfig: NetworkConfig;
  services: any;
}

export interface MempoolTickExecutionContext extends ExecutionContext {
  mempool: MempoolModelFactoryService;
  networkConfig: NetworkConfig;
  services: any;
}
