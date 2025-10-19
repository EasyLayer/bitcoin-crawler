import { Model } from '@easylayer/bitcoin-crawler';

export const AGGREGATE_ID = 'BlocksModel';

export class BlockAddedEvent {
  constructor(public readonly hash: string) {}
}

export default class BlocksModel extends Model {
  static override modelId: string = AGGREGATE_ID;

  public async processBlock(ctx: any): Promise<void> {
    const b = ctx.block;
    if (!b) return;
    this.applyEvent('BlockAddedEvent', b.height, { hash: b.hash });
  }

  protected onBlockAddedEvent(e: BlockAddedEvent): void {}
}
