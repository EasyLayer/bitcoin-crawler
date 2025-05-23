import { AggregateRoot } from '@easylayer/common/cqrs';

export type ModelType = new () => Model;

interface Parameters {
  block: any;
  services?: any;
}

export abstract class Model extends AggregateRoot {
  public parseBlock(params: Parameters): Promise<void> {
    throw new Error('method parseBlock() has to be implemented');
  }
}
