import { Model } from '@easylayer/bitcoin-crawler';

export const AGGREGATE_ID = 'BlocksModel';

export default class BlocksModel extends Model {
  static override modelId: string = AGGREGATE_ID;
  public blocks: any = [];

  public async processBlock(ctx: any): Promise<void> {
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
