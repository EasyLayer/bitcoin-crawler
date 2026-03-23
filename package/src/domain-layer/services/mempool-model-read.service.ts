import { Injectable } from '@nestjs/common';
import type { LightTransaction, MempoolTxMetadata } from '@easylayer/bitcoin';
import { MempoolModelFactoryService } from './mempool-model-factory.service';

@Injectable()
export class MempoolReadService {
  constructor(private readonly mempoolModelFactory: MempoolModelFactoryService) {}

  // ---------- helpers (local) ----------

  /** sats/vB from already-normalized metadata; undefined if invalid. */
  public feeRateFromMetadata(md?: MempoolTxMetadata): number | undefined {
    if (!md) return undefined;
    const v = Number(md.vsize);
    if (!Number.isFinite(v) || v <= 0) return undefined;

    const n =
      (typeof (md as any).modifiedfee === 'number' && (md as any).modifiedfee) ??
      (typeof (md as any).fee === 'number' && (md as any).fee) ??
      (typeof (md as any).fees?.modified === 'number' && (md as any).fees.modified) ??
      (typeof (md as any).fees?.base === 'number' && (md as any).fees.base) ??
      undefined;

    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return undefined;
    return n / v;
  }

  // ========== Read API ==========

  public async getLastHeight(): Promise<number> {
    const model = await this.mempoolModelFactory.initModel();
    return model.lastBlockHeight;
  }

  public async getMetadataSizeCount(): Promise<number> {
    const m = await this.mempoolModelFactory.initModel();
    return m.getStats().metadata;
  }

  public async getLastUpdatedMs(): Promise<number> {
    const m = await this.mempoolModelFactory.initModel();
    return m.getLastUpdatedMs();
  }

  /** Iterate through ONLY loaded slim transactions (fast, memory-safe). */
  public async forEachLoadedTx(fn: (tx: LightTransaction) => Promise<void> | void): Promise<void> {
    const model = await this.mempoolModelFactory.initModel();
    for (const tx of model.loadedTransactions()) {
      await fn(tx);
    }
  }

  /** Asynchronous generator of loaded slim transactions. */
  public async *iterLoadedTx(): AsyncGenerator<LightTransaction> {
    const model = await this.mempoolModelFactory.initModel();
    for (const tx of model.loadedTransactions()) {
      yield tx;
    }
  }

  public async getTotalVbytes(): Promise<number> {
    const m = await this.mempoolModelFactory.initModel();
    let total = 0;
    for (const md of m.iterMetadata()) {
      const v = Number(md.vsize);
      if (Number.isFinite(v) && v > 0) total += v;
    }
    return total;
  }

  public async forEachMetadata(fn: (md: MempoolTxMetadata) => Promise<void> | void): Promise<void> {
    const m = await this.mempoolModelFactory.initModel();
    for (const md of m.iterMetadata()) {
      await fn(md);
    }
  }

  /** O(1) */
  public async getMempoolSize(): Promise<{
    txidCount: number;
    metadataCount: number;
    transactionCount: number;
    providerCount: number;
    estimatedMemoryUsageMB: {
      txIndex: number;
      metadata: number;
      txStore: number;
      loadTracker: number;
      providerTx: number;
      total: number;
    };
  }> {
    const model = await this.mempoolModelFactory.initModel();
    const counts = model.getStats();
    const mem = model.getMemoryUsage('MB');

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

  /** O(1) */
  public async checkTransaction(txid: string): Promise<{
    txid: string;
    exists: boolean;
    isLoaded: boolean;
    providers: string[];
    metadata?: MempoolTxMetadata;
    fullTransaction?: LightTransaction;
    feeRate?: number;
  }> {
    const model = await this.mempoolModelFactory.initModel();

    const exists = model.hasTransaction(txid);
    const isLoaded = model.isTransactionLoaded(txid);
    const metadata = model.getTransactionMetadata(txid);
    const fullTransaction = model.getFullTransaction(txid);

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

  /** O(1) */
  public async getTransactionMetadata(txid: string): Promise<MempoolTxMetadata | undefined> {
    const model = await this.mempoolModelFactory.initModel();
    return model.getTransactionMetadata(txid);
  }

  /** O(1) */
  public async getFullTransaction(txid: string): Promise<LightTransaction | undefined> {
    const model = await this.mempoolModelFactory.initModel();
    return model.getFullTransaction(txid);
  }
}
