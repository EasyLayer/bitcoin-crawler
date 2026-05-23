import type { ExecutionContext } from '@easylayer/common/framework';
import type { Block, NetworkConfig } from '@easylayer/bitcoin';
import type { NetworkReadService, IMempoolReadService } from '../services';

export interface ProcessBlockExecutionContext extends ExecutionContext {
  block: Block;
  network: NetworkReadService;
  /**
   * Mempool read API. Inside `processBlock` it is the eventstore-backed read
   * service (state of the previous committed tick). Inside `mempoolTick` it is
   * the live-aggregate read service (state of the current tick). Both
   * implement the same `IMempoolReadService` contract.
   */
  mempool: IMempoolReadService;
  networkConfig: NetworkConfig;
  services: any;
}

export interface MempoolTickExecutionContext extends ExecutionContext {
  network: NetworkReadService;
  /** Live-aggregate read service for the current sync tick. */
  mempool: IMempoolReadService;
  networkConfig: NetworkConfig;
  services: any;
}
