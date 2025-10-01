import { Model } from '@easylayer/bitcoin-crawler';
import type { ExecutionContext } from '@easylayer/bitcoin-crawler';
import type { Block } from '@easylayer/bitcoin';

export const AGGREGATE_ID = 'BlocksModel';

export default class BlocksModel extends Model {
  public blocks: any = [];

  constructor() {
    super(AGGREGATE_ID, -1);
  }

  public async processBlock(ctx: ExecutionContext<Block>): Promise<void> {
    const b = ctx.block;
    if (!b) return;
    this.applyEvent('BlockAddedEvent', b.height, {
      hash: b.hash,
      height: b.height,
      previousblockhash: b.previousblockhash,
      tx: b?.tx?.map((t: any) => t.txid),
    });
  }

  protected onBlockAddedEvent(e: any): void {
    this.blocks.push(e.payload as { hash: string; height: number; previousblockhash: string; tx: any[] });
  }
}
