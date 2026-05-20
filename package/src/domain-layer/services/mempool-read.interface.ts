import type { LightTransaction, MempoolTxMetadata } from '@easylayer/bitcoin';

/**
 * Common read contract implemented by every mempool read service.
 *
 * Two concrete implementations:
 *  - `MempoolReadService` — reads from the eventstore-backed aggregate via
 *    `MempoolModelFactoryService.initModel()`. State reflects the last committed
 *    save; lags by one tick during a sync cycle.
 *  - `MempoolTickReadService` — reads from the live in-memory aggregate bound
 *    for the duration of a single `SyncMempoolCommand` execution. Reflects
 *    the current tick's state (just-synced transactions visible to user models).
 *
 * Consumers MUST treat the underlying aggregate as read-only. Mutations are
 * forbidden; only `SyncMempoolCommandHandler` / `RefreshMempoolCommandHandler`
 * are allowed to mutate and save.
 */
export interface IMempoolReadService {
  feeRateFromMetadata(md?: MempoolTxMetadata): number | undefined;

  getLastHeight(): Promise<number>;
  getMetadataSizeCount(): Promise<number>;
  getLastUpdatedMs(): Promise<number>;

  forEachLoadedTx(fn: (tx: LightTransaction) => Promise<void> | void): Promise<void>;
  iterLoadedTx(): AsyncGenerator<LightTransaction>;

  getTotalVbytes(): Promise<number>;
  forEachMetadata(fn: (md: MempoolTxMetadata) => Promise<void> | void): Promise<void>;

  getMempoolSize(): Promise<{
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
  }>;

  checkTransaction(txid: string): Promise<{
    txid: string;
    exists: boolean;
    isLoaded: boolean;
    providers: string[];
    metadata?: MempoolTxMetadata;
    fullTransaction?: LightTransaction;
    feeRate?: number;
  }>;

  getTransactionMetadata(txid: string): Promise<MempoolTxMetadata | undefined>;
  getFullTransaction(txid: string): Promise<LightTransaction | undefined>;
}
