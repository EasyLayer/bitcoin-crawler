import type { ExecutionContext } from '@easylayer/common/framework';
import type { Block, NetworkConfig } from '@easylayer/bitcoin';
import type { NetworkReadService, MempoolReadService } from '../services';

export interface ProcessBlockExecutionContext extends ExecutionContext {
  block: Block;
  network: NetworkReadService;
  mempool: MempoolReadService;
  networkConfig: NetworkConfig;
  services: any;
}

export interface MempoolTickExecutionContext extends ExecutionContext {
  network: NetworkReadService;
  mempool: MempoolReadService;
  networkConfig: NetworkConfig;
  services: any;
}
