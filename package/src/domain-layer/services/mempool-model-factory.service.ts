import { Injectable } from '@nestjs/common';
import { EventStoreReadService } from '@easylayer/common/eventstore';
import { Mempool, MempoolTransaction, Transaction } from '@easylayer/bitcoin';
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
        allowPruning: false,
        snapshotsEnabled: true,
        snapshotInterval: 25,
      },
    });
  }

  public async initModel(): Promise<Mempool> {
    const model = await this.eventStoreService.getOne(this.createNewModel());
    return model;
  }

  // ========== BASIC STATS AND INFO ==========

  /**
   * Gets comprehensive mempool statistics
   * Time complexity: O(n) for fee rate calculations
   */
  public async getMempoolStats(): Promise<{
    totalTxids: number;
    loadedMetadata: number;
    loadedFullTransactions: number;
    syncProgress: number;
    isSynchronized: boolean;
    averageFeeRate: number;
    medianFeeRate: number;
    totalProviders: number;
    feeRateDistribution: { [feeRate: number]: number };
  }> {
    const model = await this.initModel();
    return model.getMempoolStats();
  }

  /**
   * Gets mempool size and memory usage information
   * Time complexity: O(1)
   */
  public async getMempoolSize(): Promise<{
    txidCount: number;
    metadataCount: number;
    fullTransactionCount: number;
    estimatedMemoryUsage: {
      txidMappings: number;
      metadata: number;
      fullTransactions: number;
      providerMappings: number;
      total: number;
    };
  }> {
    const model = await this.initModel();
    return model.getMempoolSize();
  }

  /**
   * Gets synchronization progress details
   * Time complexity: O(1)
   */
  public async getSyncProgress(): Promise<{
    isSynchronized: boolean;
    progress: number;
    totalExpected: number;
    loaded: number;
    remaining: number;
  }> {
    const model = await this.initModel();
    return model.getSyncProgress();
  }

  /**
   * Check if mempool is ready for business operations
   * Time complexity: O(1)
   */
  public async isReady(): Promise<boolean> {
    const model = await this.initModel();
    return model.isReady();
  }

  /**
   * Get all provider names currently registered
   * Time complexity: O(1)
   */
  public async getProviderNames(): Promise<string[]> {
    const model = await this.initModel();
    return model.getProviderNames();
  }

  // ========== TRANSACTION QUERIES ==========

  /**
   * Get all current transaction IDs
   * Time complexity: O(n) where n = number of transactions
   */
  public async getCurrentTxids(): Promise<string[]> {
    const model = await this.initModel();
    return model.getCurrentTxids();
  }

  /**
   * Checks if a specific transaction exists and gets its details
   * Time complexity: O(1)
   */
  public async checkTransaction(txid: string): Promise<{
    txid: string;
    exists: boolean;
    isLoaded: boolean;
    metadata?: MempoolTransaction;
    fullTransaction?: Transaction;
    providers: string[];
  }> {
    const model = await this.initModel();

    const exists = model.hasTransaction(txid);
    const isLoaded = model.isTransactionLoaded(txid);
    const metadata = model.getTransactionMetadata(txid);
    const fullTransaction = model.getFullTransaction(txid);
    const providers = model.getProvidersForTransaction(txid);

    return {
      txid,
      exists,
      isLoaded,
      metadata,
      fullTransaction,
      providers,
    };
  }

  /**
   * Get transaction metadata by txid
   * Time complexity: O(1)
   */
  public async getTransactionMetadata(txid: string): Promise<MempoolTransaction | undefined> {
    const model = await this.initModel();
    return model.getTransactionMetadata(txid);
  }

  /**
   * Get full transaction data by txid
   * Time complexity: O(1)
   */
  public async getFullTransaction(txid: string): Promise<Transaction | undefined> {
    const model = await this.initModel();
    return model.getFullTransaction(txid);
  }

  // ========== FEE RATE QUERIES ==========

  /**
   * Gets transactions by fee rate range
   * Time complexity: O(n) where n = number of metadata entries
   */
  public async getTransactionsByFeeRate(
    minFeeRate: number,
    maxFeeRate: number = Infinity
  ): Promise<{
    transactions: Array<{
      txid: string;
      feeRate: number;
      metadata: MempoolTransaction;
      fullTransaction?: Transaction;
    }>;
    count: number;
    avgFeeRate: number;
  }> {
    const model = await this.initModel();
    const transactions = model.getTransactionsByFeeRateRange(minFeeRate, maxFeeRate);

    const avgFeeRate =
      transactions.length > 0 ? transactions.reduce((sum, tx) => sum + tx.feeRate, 0) / transactions.length : 0;

    return {
      transactions,
      count: transactions.length,
      avgFeeRate,
    };
  }

  /**
   * Get transactions with fee rate above threshold
   * Time complexity: O(n) where n = number of metadata entries
   */
  public async getTransactionsAboveFeeRate(minFeeRate: number): Promise<{
    txids: string[];
    count: number;
  }> {
    const model = await this.initModel();
    const txids = model.getTransactionsAboveFeeRate(minFeeRate);

    return {
      txids,
      count: txids.length,
    };
  }

  /**
   * Get top N transactions by fee rate
   * Time complexity: O(n log n) where n = number of metadata entries
   */
  public async getTopTransactionsByFeeRate(limit: number = 100): Promise<{
    transactions: Array<{
      txid: string;
      feeRate: number;
      metadata: MempoolTransaction;
      fullTransaction?: Transaction;
    }>;
    count: number;
    avgFeeRate: number;
  }> {
    const model = await this.initModel();
    const transactions = model.getTopTransactionsByFeeRate(limit);

    const avgFeeRate =
      transactions.length > 0 ? transactions.reduce((sum, tx) => sum + tx.feeRate, 0) / transactions.length : 0;

    return {
      transactions,
      count: transactions.length,
      avgFeeRate,
    };
  }

  /**
   * Gets fee rate statistics for loaded transactions
   * Time complexity: O(n) where n = number of metadata entries
   */
  public async getFeeRateStats(): Promise<{
    min: number;
    max: number;
    avg: number;
    median: number;
    count: number;
    distribution: { [feeRate: number]: number };
  }> {
    const model = await this.initModel();
    const stats = model.getMempoolStats();

    // Calculate min/max from distribution
    const feeRates = Object.keys(stats.feeRateDistribution)
      .map(Number)
      .sort((a, b) => a - b);
    const min = feeRates.length > 0 ? feeRates[0]! : 0;
    const max = feeRates.length > 0 ? feeRates[feeRates.length - 1]! : 0;

    return {
      min,
      max,
      avg: stats.averageFeeRate,
      median: stats.medianFeeRate,
      count: stats.loadedMetadata,
      distribution: stats.feeRateDistribution,
    };
  }

  // ========== READY TRANSACTIONS ==========

  /**
   * Get transactions that are ready for processing (loaded and meet criteria)
   * Time complexity: O(n) where n = number of loaded transactions
   */
  public async getReadyTransactions(): Promise<{
    transactions: Array<{
      txid: string;
      transaction: Transaction;
      metadata: MempoolTransaction;
      feeRate: number;
      loadedAt: number;
      providerIndex: number;
    }>;
    count: number;
    avgFeeRate: number;
  }> {
    const model = await this.initModel();
    const transactions = model.getReadyTransactions();

    const avgFeeRate =
      transactions.length > 0 ? transactions.reduce((sum, tx) => sum + tx.feeRate, 0) / transactions.length : 0;

    return {
      transactions,
      count: transactions.length,
      avgFeeRate,
    };
  }

  /**
   * Gets transactions that haven't been loaded yet
   * Time complexity: O(n) where n = number of metadata entries
   */
  public async getPendingTransactions(): Promise<{
    txids: string[];
    count: number;
    percentage: number;
  }> {
    const model = await this.initModel();
    const allTxids = model.getCurrentTxids();
    const pending: string[] = [];

    for (const txid of allTxids) {
      if (!model.isTransactionLoaded(txid)) {
        pending.push(txid);
      }
    }

    const percentage = allTxids.length > 0 ? (pending.length / allTxids.length) * 100 : 0;

    return {
      txids: pending,
      count: pending.length,
      percentage,
    };
  }

  // ========== PROVIDER QUERIES ==========

  /**
   * Get providers that have specific transaction
   * Time complexity: O(1)
   */
  public async getProvidersForTransaction(txid: string): Promise<string[]> {
    const model = await this.initModel();
    return model.getProvidersForTransaction(txid);
  }

  // ========== STREAMING METHODS ==========

  /**
   * Streams current transaction IDs in batches
   * Time complexity: O(n) but memory efficient
   */
  public async *streamCurrentTxids(batchSize: number = 1000): AsyncGenerator<
    {
      batch: string[];
      batchIndex: number;
      hasMore: boolean;
      totalCount: number;
    },
    void,
    unknown
  > {
    const model = await this.initModel();
    const allTxids = model.getCurrentTxids();
    const totalCount = allTxids.length;

    for (let i = 0; i < allTxids.length; i += batchSize) {
      const batch = allTxids.slice(i, i + batchSize);
      const batchIndex = Math.floor(i / batchSize);
      const hasMore = i + batchSize < allTxids.length;

      yield {
        batch,
        batchIndex,
        hasMore,
        totalCount,
      };
    }
  }

  /**
   * Streams ready transactions in batches
   * Time complexity: O(n) but memory efficient
   */
  public async *streamReadyTransactions(batchSize: number = 100): AsyncGenerator<
    {
      batch: Array<{
        txid: string;
        transaction: Transaction;
        metadata: MempoolTransaction;
        feeRate: number;
        loadedAt: number;
        providerIndex: number;
      }>;
      batchIndex: number;
      hasMore: boolean;
      totalCount: number;
    },
    void,
    unknown
  > {
    const model = await this.initModel();
    const readyTransactions = model.getReadyTransactions();
    const totalCount = readyTransactions.length;

    for (let i = 0; i < readyTransactions.length; i += batchSize) {
      const batch = readyTransactions.slice(i, i + batchSize);
      const batchIndex = Math.floor(i / batchSize);
      const hasMore = i + batchSize < readyTransactions.length;

      yield {
        batch,
        batchIndex,
        hasMore,
        totalCount,
      };
    }
  }

  /**
   * Streams transactions by fee rate range in batches
   * Time complexity: O(n) but memory efficient
   */
  public async *streamTransactionsByFeeRate(
    minFeeRate: number,
    maxFeeRate: number = Infinity,
    batchSize: number = 100
  ): AsyncGenerator<
    {
      batch: Array<{
        txid: string;
        feeRate: number;
        metadata: MempoolTransaction;
        fullTransaction?: Transaction;
      }>;
      batchIndex: number;
      hasMore: boolean;
      totalCount: number;
    },
    void,
    unknown
  > {
    const model = await this.initModel();
    const transactions = model.getTransactionsByFeeRateRange(minFeeRate, maxFeeRate);
    const totalCount = transactions.length;

    for (let i = 0; i < transactions.length; i += batchSize) {
      const batch = transactions.slice(i, i + batchSize);
      const batchIndex = Math.floor(i / batchSize);
      const hasMore = i + batchSize < transactions.length;

      yield {
        batch,
        batchIndex,
        hasMore,
        totalCount,
      };
    }
  }

  /**
   * Streams comprehensive mempool data with statistics first
   * Time complexity: O(n) but memory efficient
   */
  public async *streamMempoolData(
    options: {
      includeFeeRateStats?: boolean;
      includeReadyTransactions?: boolean;
      includePendingTxids?: boolean;
      batchSize?: number;
    } = {}
  ): AsyncGenerator<any, void, unknown> {
    const {
      includeFeeRateStats = true,
      includeReadyTransactions = true,
      includePendingTxids = false,
      batchSize = 100,
    } = options;

    // First yield general statistics
    const stats = await this.getMempoolStats();
    const size = await this.getMempoolSize();
    const syncProgress = await this.getSyncProgress();

    yield {
      type: 'stats',
      data: {
        general: stats,
        size,
        syncProgress,
      },
    };

    // Fee rate statistics
    if (includeFeeRateStats) {
      const feeRateStats = await this.getFeeRateStats();
      yield {
        type: 'feeRateStats',
        data: feeRateStats,
      };
    }

    // Stream ready transactions
    if (includeReadyTransactions) {
      for await (const batchData of this.streamReadyTransactions(batchSize)) {
        yield {
          type: 'readyTransactions',
          data: batchData,
        };
      }
    }

    // Stream pending transaction IDs
    if (includePendingTxids) {
      const pendingData = await this.getPendingTransactions();
      yield {
        type: 'pendingTransactions',
        data: pendingData,
      };
    }
  }
}
