import { Model } from '@easylayer/bitcoin-crawler';

export const AGGREGATE_ID = 'MempoolMonitoringClassModel';

export class MempoolTickEvent {
  constructor(public readonly tickIndex: number) {}
}

export class MempoolTxSeenEvent {
  constructor(public readonly txid: string) {}
}

export default class MempoolMonitoringClassModel extends Model {
  static override modelId: string = AGGREGATE_ID;

  private ticks = 0;
  private txCount = 0;

  public async mempoolTick(ctx: any): Promise<void> {
    if (!ctx?.mempool) return;

    // sources.mempool equivalent — fires once per tick
    this.applyEvent('MempoolTickEvent', this.ticks, { tickIndex: this.ticks });

    // sources.mempoolTx equivalent — iterate live aggregate
    for await (const tx of ctx.mempool.iterLoadedTx()) {
      if (!tx || typeof tx.txid !== 'string') continue;
      this.applyEvent('MempoolTxSeenEvent', this.txCount, { txid: tx.txid });
    }
  }

  protected onMempoolTickEvent(_: MempoolTickEvent): void {
    this.ticks += 1;
  }

  protected onMempoolTxSeenEvent(_: MempoolTxSeenEvent): void {
    this.txCount += 1;
  }
}
