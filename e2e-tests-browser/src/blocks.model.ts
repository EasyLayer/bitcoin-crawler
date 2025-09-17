import { Model } from '@easylayer/bitcoin-crawler';
import type { ExecutionContext } from '@easylayer/bitcoin-crawler';
import type { Block } from '@easylayer/bitcoin';

export const AGGREGATE_ID = 'BlocksModel';

export class BlockAddedEvent {
  constructor(public readonly hash: string) {}
}

export default class BlocksModel extends Model {
  constructor() {
    super(AGGREGATE_ID, -1);
  }

  public async processBlock(ctx: ExecutionContext<Block>): Promise<void> {
    const b = ctx.block;
    if (!b) return;
    this.applyEvent('BlockAddedEvent', b.height, { hash: b.hash });
  }

  protected onBlockAddedEvent(e: BlockAddedEvent): void {}
}
