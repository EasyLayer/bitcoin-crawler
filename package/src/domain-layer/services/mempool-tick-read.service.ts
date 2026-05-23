import { Injectable } from '@nestjs/common';
import { Mempool } from '@easylayer/bitcoin';
import type { LightTransaction, MempoolTxMetadata } from '@easylayer/bitcoin';
import type { IMempoolReadService } from './mempool-read.interface';

/**
 * Live-aggregate read facade for `mempoolTick`.
 *
 * Bound by `SyncMempoolCommandHandler` for the duration of a single
 * `SyncMempoolCommand` execution. While bound, all read methods are served
 * from the in-memory mutated aggregate — so user models see the transactions
 * that the current tick just synced, NOT a stale snapshot from the previous
 * commit.
 *
 * Consumers are read-only by contract. The aggregate is mutated and persisted
 * only by `SyncMempoolCommandHandler`; passing it through this facade does not
 * expose `apply()` / `commit()` and does not let user models alter the model.
 */
@Injectable()
export class MempoolTickReadService implements IMempoolReadService {
  private model: Mempool | null = null;

  /** Bind the live aggregate for the current sync tick. */
  public bind(model: Mempool): void {
    this.model = model;
  }

  /** Release the binding once the tick is complete. */
  public release(): void {
    this.model = null;
  }

  private require(): Mempool {
    if (!this.model) {
      throw new Error(
        'MempoolTickReadService is not bound. It is only available inside a SyncMempoolCommand execution.'
      );
    }
    return this.model;
  }

  public feeRateFromMetadata(md?: MempoolTxMetadata): number | undefined {
    if (!md) return undefined;
    const v = Number(md.vsize);
    if (!Number.isFinite(v) || v <= 0) return undefined;
    const fee = Number(md.modifiedfee);
    if (!Number.isFinite(fee) || fee <= 0) return undefined;
    return fee / v;
  }

  public async getLastHeight(): Promise<number> {
    return this.require().lastBlockHeight;
  }

  public async getMetadataSizeCount(): Promise<number> {
    return this.require().getStats().metadata;
  }

  public async getLastUpdatedMs(): Promise<number> {
    return this.require().getLastUpdatedMs();
  }

  public async forEachLoadedTx(fn: (tx: LightTransaction) => Promise<void> | void): Promise<void> {
    const m = this.require();
    for (const tx of m.loadedTransactions()) {
      await fn(tx);
    }
  }

  public async *iterLoadedTx(): AsyncGenerator<LightTransaction> {
    const m = this.require();
    for (const tx of m.loadedTransactions()) {
      yield tx;
    }
  }

  public async getTotalVbytes(): Promise<number> {
    const m = this.require();
    let total = 0;
    for (const md of m.iterMetadata()) {
      const v = Number(md.vsize);
      if (Number.isFinite(v) && v > 0) total += v;
    }
    return total;
  }

  public async forEachMetadata(fn: (md: MempoolTxMetadata) => Promise<void> | void): Promise<void> {
    const m = this.require();
    for (const md of m.iterMetadata()) {
      await fn(md);
    }
  }

  public async getMempoolSize() {
    const m = this.require();
    const counts = m.getStats();
    const mem = m.getMemoryUsage('MB');

    return {
      txidCount: counts.txids,
      metadataCount: counts.metadata,
      transactionCount: counts.transactions,
      providerCount: counts.providers,
      estimatedMemoryUsageMB: {
        txIndex: mem.bytes.txIndex,
        metadata: mem.bytes.metadata,
        txStore: mem.bytes.txStore,
        loadTracker: mem.bytes.loadTracker,
        providerTx: mem.bytes.providerTx,
        total: mem.bytes.total,
      },
    };
  }

  public async checkTransaction(txid: string) {
    const m = this.require();
    const exists = m.hasTransaction(txid);
    const isLoaded = m.isTransactionLoaded(txid);
    const metadata = m.getTransactionMetadata(txid);
    const fullTransaction = m.getFullTransaction(txid);

    const feeRate =
      fullTransaction && typeof fullTransaction.feeRate === 'number' && Number.isFinite(fullTransaction.feeRate)
        ? fullTransaction.feeRate
        : this.feeRateFromMetadata(metadata);

    return {
      txid,
      exists,
      isLoaded,
      providers: [],
      metadata,
      fullTransaction,
      feeRate,
    };
  }

  public async getTransactionMetadata(txid: string): Promise<MempoolTxMetadata | undefined> {
    return this.require().getTransactionMetadata(txid);
  }

  public async getFullTransaction(txid: string): Promise<LightTransaction | undefined> {
    return this.require().getFullTransaction(txid);
  }
}
