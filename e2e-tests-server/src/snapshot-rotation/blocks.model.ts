import { Model } from '@easylayer/bitcoin-crawler';

export const AGGREGATE_ID = 'RotationBlocksModel';

export class BlockAddedEvent {
  constructor(public readonly hash: string) {}
}

export default class RotationBlocksModel extends Model {
  static override modelId: string = AGGREGATE_ID;

  // snapshot every single version so each block triggers a snapshot → rotation
  static override aggregateOptionsOverride = {
    snapshotsEnabled: true,
    snapshotInterval: 1,
    snapshotMinKeep: 1,
    snapshotKeepWindow: 0,
  };

  public async processBlock(ctx: any): Promise<void> {
    const b = ctx.block;
    if (!b) return;
    this.applyEvent('BlockAddedEvent', b.height, { hash: b.hash });
  }

  protected onBlockAddedEvent(_e: BlockAddedEvent): void {}
}
