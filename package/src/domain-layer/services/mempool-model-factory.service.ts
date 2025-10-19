import { Injectable } from '@nestjs/common';
import { EventStoreReadService } from '@easylayer/common/eventstore';
import { Mempool } from '@easylayer/bitcoin';
import type { LightTransaction, MempoolTxMetadata } from '@easylayer/bitcoin';
import { BusinessConfig } from '../../config';

export const MEMPOOL_AGGREGATE_ID = 'mempool';

@Injectable()
export class MempoolModelFactoryService {
  constructor(
    private readonly eventStoreService: EventStoreReadService<Mempool>,
    private readonly businessConfig: BusinessConfig
  ) {}

  public createNewModel(): Mempool {
    return new Mempool({
      aggregateId: MEMPOOL_AGGREGATE_ID,
      minFeeRate: this.businessConfig.MEMPOOL_MIN_FEE_RATE,
      blockHeight: -1,
      options: {
        allowPruning: true,
        snapshotsEnabled: true,
        snapshotInterval: 6,
      },
    });
  }

  public async initModel(): Promise<Mempool> {
    return this.eventStoreService.getOne(this.createNewModel());
  }

  // ---------- helpers (local) ----------

  /** sats/vB from already-normalized metadata; undefined if invalid. */
  private feeRateFromMetadata(md?: MempoolTxMetadata): number | undefined {
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
    const model = await this.initModel();
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
    providers: string[]; // пусто, пока нет метода в модели
    metadata?: MempoolTxMetadata;
    fullTransaction?: LightTransaction;
    feeRate?: number;
  }> {
    const model = await this.initModel();

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
      providers: [], // вернём к реальным данным, когда добавишь getProvidersForTransaction
      metadata,
      fullTransaction,
      feeRate,
    };
  }

  /** O(1) */
  public async getTransactionMetadata(txid: string): Promise<MempoolTxMetadata | undefined> {
    const model = await this.initModel();
    return model.getTransactionMetadata(txid);
  }

  /** O(1) */
  public async getFullTransaction(txid: string): Promise<LightTransaction | undefined> {
    const model = await this.initModel();
    return model.getFullTransaction(txid);
  }
}
