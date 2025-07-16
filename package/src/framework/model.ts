import type { NetworkConfig } from '@easylayer/bitcoin';
import { AggregateRoot } from '@easylayer/common/cqrs';

export type ModelType = new () => Model;

interface Parameters {
  block: any;
  networkConfig: NetworkConfig;
  services?: any;
}

export abstract class Model extends AggregateRoot {
  public parseBlock(params: Parameters): Promise<void> {
    throw new Error('method parseBlock() has to be implemented');
  }
}
