import { v4 as uuidv4 } from 'uuid';
import { Model, ExecutionContext } from '@easylayer/bitcoin-crawler';
import {
  BlockFeeAnalyzedEvent,
  MempoolAnalyzedEvent,
  FeeRecommendationsUpdatedEvent
} from './events';
import {
  analyzeBlockFees,
  analyzeMempoolFees,
  calculateFeeRecommendations,
  getActiveProtocolFeatures,
  determineTransactionType,
  BlockFeeData,
  MempoolFeeData,
  FeeRecommendations,
  FeeEstimate,
  calculateFeeForTransaction,
  isFeeCompetitive
} from './utils';

export interface FeeModelState {
  // Historical data for last N blocks
  blockHistory: Map<number, BlockFeeData>; // blockHeight -> BlockFeeData
  
  // Current mempool analysis
  currentMempoolAnalysis: MempoolFeeData | null;
  
  // Fee recommendations
  feeRecommendations: FeeRecommendations | null;
  
  // Configuration
  historyDepth: number; // How many blocks to keep in history
  lastUpdated: number;
  
  // Protocol state tracking
  currentBlockHeight: number;
  activeFeatures: string[];
}

export default class BitcoinFeeCalculatorModel extends Model {
  private state: FeeModelState = {
    blockHistory: new Map(),
    currentMempoolAnalysis: null,
    feeRecommendations: null,
    historyDepth: 144, // ~24 hours of blocks
    lastUpdated: 0,
    currentBlockHeight: 0,
    activeFeatures: []
  };

  constructor() {
    super('bitcoin-fee-calculator');
  }

  protected toJsonPayload(): any {
    return {
      blockHistory: Array.from(this.state.blockHistory.entries()),
      currentMempoolAnalysis: this.state.currentMempoolAnalysis,
      feeRecommendations: this.state.feeRecommendations,
      historyDepth: this.state.historyDepth,
      lastUpdated: this.state.lastUpdated,
      currentBlockHeight: this.state.currentBlockHeight,
      activeFeatures: this.state.activeFeatures
    };
  }

  protected fromSnapshot(snapshot: any): void {
    if (snapshot.blockHistory && Array.isArray(snapshot.blockHistory)) {
      this.state.blockHistory = new Map(snapshot.blockHistory);
    }
    
    this.state.currentMempoolAnalysis = snapshot.currentMempoolAnalysis || null;
    this.state.feeRecommendations = snapshot.feeRecommendations || null;
    this.state.historyDepth = snapshot.historyDepth || 144;
    this.state.lastUpdated = snapshot.lastUpdated || 0;
    this.state.currentBlockHeight = snapshot.currentBlockHeight || 0;
    this.state.activeFeatures = snapshot.activeFeatures || [];
    
    Object.setPrototypeOf(this, BitcoinFeeCalculatorModel.prototype);
  }

  async parseBlock(context: ExecutionContext): Promise<void> {
    const { block, mempool, networkConfig } = context;
    
    // Analyze current block fees
    const blockFeeData = analyzeBlockFees(block);
    const activeFeatures = getActiveProtocolFeatures(block.height);
    
    // Get current mempool analysis using methods from mempool service
    const mempoolFeeData = await this.analyzeMempoolFromContext(mempool);
    
    // Apply block analysis event
    await this.apply(new BlockFeeAnalyzedEvent({
      aggregateId: this.aggregateId,
      requestId: uuidv4(),
      blockHeight: block.height,
      timestamp: block.time,
      blockFeeData,
      activeFeatures,
      blockHash: block.hash
    }));

    // Apply mempool analysis event
    await this.apply(new MempoolAnalyzedEvent({
      aggregateId: this.aggregateId,
      requestId: uuidv4(),
      blockHeight: block.height,
      timestamp: Date.now(),
      mempoolFeeData,
      mempoolStats: {
        totalTxids: 0, // Will be filled by event handler
        loadedTransactions: 0,
        isSynchronized: true,
        fullSyncThreshold: 0,
        currentBatchSize: 0
      }
    }));

    // Calculate and apply new fee recommendations (done in event handler)
  }

  // Analyze mempool using context
  private async analyzeMempoolFromContext(mempool: any): Promise<MempoolFeeData> {
    try {
      // Get mempool statistics
      const stats = await mempool.getMempoolStats();
      
      // Get fee rate distribution from mempool
      const lowFeeTransactions = await mempool.getTransactionsByFeeRate(0, 10);
      const mediumFeeTransactions = await mempool.getTransactionsByFeeRate(10, 50);
      const highFeeTransactions = await mempool.getTransactionsByFeeRate(50, undefined);
      
      // Get size distribution
      const smallTransactions = await mempool.getTransactionsBySize(0, 250);
      const mediumTransactions = await mempool.getTransactionsBySize(250, 1000);
      const largeTransactions = await mempool.getTransactionsBySize(1000, undefined);
      
      return analyzeMempoolFees({
        totalTransactions: stats.loadedTransactions,
        lowFeeTransactions: lowFeeTransactions.transactions,
        mediumFeeTransactions: mediumFeeTransactions.transactions,
        highFeeTransactions: highFeeTransactions.transactions,
        smallTransactions: smallTransactions.transactions,
        mediumTransactions: mediumTransactions.transactions,
        largeTransactions: largeTransactions.transactions,
        isSynchronized: stats.isSynchronized
      });
    } catch (error) {
      // Fallback if mempool analysis fails
      return {
        timestamp: Date.now(),
        totalTransactions: 0,
        feeRateDistribution: {
          low: { range: [0, 10], count: 0, totalFees: 0 },
          medium: { range: [10, 50], count: 0, totalFees: 0 },
          high: { range: [50, Infinity], count: 0, totalFees: 0 }
        },
        sizeDistribution: {
          small: { range: [0, 250], count: 0 },
          medium: { range: [250, 1000], count: 0 },
          large: { range: [1000, Infinity], count: 0 }
        },
        averageFeeRate: 0,
        medianFeeRate: 0,
        estimatedBlocks: {
          nextBlock: 0,
          next3Blocks: 0,
          next6Blocks: 0
        },
        rbfTransactions: 0,
        rbfPercentage: 0,
        isSynchronized: false
      };
    }
  }

  // Event handlers
  private onBlockFeeAnalyzedEvent({ payload }: BlockFeeAnalyzedEvent) {
    const { blockHeight, blockFeeData, activeFeatures } = payload;
    
    // Update state
    this.state.currentBlockHeight = blockHeight;
    this.state.activeFeatures = activeFeatures;
    this.state.blockHistory.set(blockHeight, blockFeeData);
    
    // Maintain history depth - remove old blocks
    if (this.state.blockHistory.size > this.state.historyDepth) {
      const oldestHeight = Math.min(...this.state.blockHistory.keys());
      this.state.blockHistory.delete(oldestHeight);
    }
    
    // Trigger recommendations update
    this.updateRecommendations();
  }

  private onMempoolAnalyzedEvent({ payload }: MempoolAnalyzedEvent) {
    this.state.currentMempoolAnalysis = payload.mempoolFeeData;
    
    // Trigger recommendations update after mempool analysis
    this.updateRecommendations();
  }

  private onFeeRecommendationsUpdatedEvent({ payload }: FeeRecommendationsUpdatedEvent) {
    this.state.feeRecommendations = payload.recommendations;
    this.state.lastUpdated = payload.timestamp;
  }

  // Internal method to update recommendations
  private updateRecommendations(): void {
    const recentBlocks = Array.from(this.state.blockHistory.values()).slice(-20);
    
    const recommendations = calculateFeeRecommendations(
      recentBlocks,
      this.state.currentMempoolAnalysis,
      this.state.activeFeatures
    );

    // Apply recommendations update event
    this.apply(new FeeRecommendationsUpdatedEvent({
      aggregateId: this.aggregateId,
      requestId: uuidv4(),
      blockHeight: this.state.currentBlockHeight,
      timestamp: Date.now(),
      recommendations
    }));
  }

  // ===== PUBLIC GETTERS FOR SERVICE LAYER =====

  /**
   * Get current fee recommendations
   * Complexity: O(1)
   */
  public getCurrentRecommendations(): FeeRecommendations | null {
    return this.state.feeRecommendations;
  }

  /**
   * Get block history
   * Complexity: O(1)
   */
  public getBlockHistory(): Map<number, BlockFeeData> {
    return new Map(this.state.blockHistory);
  }

  /**
   * Get current mempool analysis
   * Complexity: O(1)
   */
  public getCurrentMempoolAnalysis(): MempoolFeeData | null {
    return this.state.currentMempoolAnalysis;
  }

  /**
   * Get active protocol features
   * Complexity: O(1)
   */
  public getActiveFeatures(): string[] {
    return [...this.state.activeFeatures];
  }

  /**
   * Get fee estimate for specific confirmation target
   * Complexity: O(1)
   */
  public getFeeEstimate(targetBlocks: number): FeeEstimate | null {
    if (!this.state.feeRecommendations) {
      return null;
    }

    // Simple mapping based on target blocks
    if (targetBlocks === 1) {
      return {
        feeRate: this.state.feeRecommendations.priority,
        confidence: this.state.feeRecommendations.confidence,
        targetBlocks: 1
      };
    } else if (targetBlocks <= 3) {
      return {
        feeRate: this.state.feeRecommendations.standard,
        confidence: this.state.feeRecommendations.confidence,
        targetBlocks: targetBlocks
      };
    } else {
      return {
        feeRate: this.state.feeRecommendations.economy,
        confidence: this.state.feeRecommendations.confidence,
        targetBlocks: targetBlocks
      };
    }
  }

  /**
   * Get historical fee rate percentiles from stored block data
   * Complexity: O(n) where n = total fee rates in history
   */
  public getHistoricalPercentiles(): { [key: string]: number } | null {
    if (this.state.blockHistory.size === 0) {
      return null;
    }

    const allFeeRates: number[] = [];
    
    for (const blockData of this.state.blockHistory.values()) {
      allFeeRates.push(...blockData.feeRates);
    }

    if (allFeeRates.length === 0) {
      return null;
    }

    allFeeRates.sort((a, b) => a - b);

    return {
      p10: this.getPercentile(allFeeRates, 0.10),
      p25: this.getPercentile(allFeeRates, 0.25),
      p50: this.getPercentile(allFeeRates, 0.50),
      p75: this.getPercentile(allFeeRates, 0.75),
      p90: this.getPercentile(allFeeRates, 0.90),
      p95: this.getPercentile(allFeeRates, 0.95),
      p99: this.getPercentile(allFeeRates, 0.99)
    };
  }

  /**
   * Calculate fee for specific transaction based on current recommendations
   * Complexity: O(1)
   */
  public calculateTransactionFee(
    txSize: number,
    txWeight: number,
    targetBlocks: number,
    txType: 'legacy' | 'segwit' | 'taproot' = 'segwit'
  ): {
    totalFee: number;
    feeRate: number;
    effectiveSize: number;
  } | null {
    const recommendations = this.state.feeRecommendations;
    
    if (!recommendations) {
      return null;
    }

    return calculateFeeForTransaction(
      txSize,
      txWeight,
      targetBlocks,
      recommendations,
      txType
    );
  }

  /**
   * Check if fee rate is competitive based on current state
   * Complexity: O(1)
   */
  public checkFeeCompetitiveness(
    feeRate: number,
    targetBlocks: number
  ): {
    isCompetitive: boolean;
    competitiveness: 'LOW' | 'MEDIUM' | 'HIGH';
    suggestedFeeRate: number;
  } | null {
    const recommendations = this.state.feeRecommendations;
    
    if (!recommendations) {
      return null;
    }

    return isFeeCompetitive(
      feeRate,
      targetBlocks,
      recommendations,
      this.state.currentMempoolAnalysis
    );
  }

  /**
   * Get fee rate distribution from stored block history
   * Complexity: O(n) where n = total fee rates in history
   */
  public getFeeRateDistribution(): {
    distribution: { [range: string]: number };
    totalTransactions: number;
    averageFeeRate: number;
    medianFeeRate: number;
  } | null {
    if (this.state.blockHistory.size === 0) {
      return null;
    }

    const allFeeRates: number[] = [];
    let totalTransactions = 0;

    for (const blockData of this.state.blockHistory.values()) {
      allFeeRates.push(...blockData.feeRates);
      totalTransactions += blockData.payingTransactions;
    }

    if (allFeeRates.length === 0) {
      return null;
    }

    // Create fee rate distribution buckets
    const distribution: { [range: string]: number } = {
      '0-1': 0,
      '1-5': 0,
      '5-10': 0,
      '10-20': 0,
      '20-50': 0,
      '50-100': 0,
      '100+': 0
    };

    allFeeRates.forEach(rate => {
      if (rate < 1) distribution['0-1']++;
      else if (rate < 5) distribution['1-5']++;
      else if (rate < 10) distribution['5-10']++;
      else if (rate < 20) distribution['10-20']++;
      else if (rate < 50) distribution['20-50']++;
      else if (rate < 100) distribution['50-100']++;
      else distribution['100+']++;
    });

    const sortedRates = [...allFeeRates].sort((a, b) => a - b);
    const averageFeeRate = allFeeRates.reduce((a, b) => a + b, 0) / allFeeRates.length;
    const medianFeeRate = sortedRates[Math.floor(sortedRates.length / 2)];

    return {
      distribution,
      totalTransactions,
      averageFeeRate: Math.round(averageFeeRate * 100) / 100,
      medianFeeRate: Math.round(medianFeeRate * 100) / 100
    };
  }

  /**
   * Get mempool competition analysis based on current state
   * Complexity: O(1)
   */
  public getMempoolCompetitionAnalysis(): {
    competitionLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    recommendedAction: string;
    nextBlockCapacity: number;
    estimatedWaitTime: { [feeRate: number]: number };
  } | null {
    const mempoolAnalysis = this.state.currentMempoolAnalysis;
    const recommendations = this.state.feeRecommendations;
    
    if (!mempoolAnalysis || !recommendations) {
      return null;
    }

    // Determine competition level
    const highFeeRatio = mempoolAnalysis.feeRateDistribution.high.count / 
                        Math.max(mempoolAnalysis.totalTransactions, 1);
    
    let competitionLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    let recommendedAction = 'Normal fee rates should work fine';
    
    if (highFeeRatio > 0.4) {
      competitionLevel = 'HIGH';
      recommendedAction = 'Consider using priority fees or waiting for lower congestion';
    } else if (highFeeRatio > 0.2) {
      competitionLevel = 'MEDIUM';
      recommendedAction = 'Standard fees recommended, monitor mempool conditions';
    }

    // Estimate wait times for different fee rates (simplified)
    const estimatedWaitTime: { [feeRate: number]: number } = {};
    const feeRates = [1, 5, 10, 20, 50, 100];
    
    feeRates.forEach(rate => {
      if (rate >= recommendations.priority) {
        estimatedWaitTime[rate] = 1; // Next block
      } else if (rate >= recommendations.standard) {
        estimatedWaitTime[rate] = 3; // ~30 minutes
      } else if (rate >= recommendations.economy) {
        estimatedWaitTime[rate] = 6; // ~1 hour
      } else {
        estimatedWaitTime[rate] = 12; // ~2 hours or more
      }
    });

    return {
      competitionLevel,
      recommendedAction,
      nextBlockCapacity: mempoolAnalysis.estimatedBlocks.nextBlock,
      estimatedWaitTime
    };
  }

  /**
   * Get protocol feature analysis from stored block history
   * Complexity: O(n) where n = number of blocks in history
   */
  public getProtocolFeatureAnalysis(): {
    activeFeatures: string[];
    transactionTypeDistribution: {
      legacy: { count: number; percentage: number };
      segwit: { count: number; percentage: number };
      taproot: { count: number; percentage: number };
    };
    averageFeeByType: {
      legacy: number;
      segwit: number;
      taproot: number;
    };
  } | null {
    const blockHistory = this.state.blockHistory;
    const activeFeatures = this.state.activeFeatures;
    
    if (blockHistory.size === 0) {
      return null;
    }

    let totalLegacy = 0, totalSegwit = 0, totalTaproot = 0;
    let legacyFees: number[] = [], segwitFees: number[] = [], taprootFees: number[] = [];

    for (const blockData of blockHistory.values()) {
      totalLegacy += blockData.transactionTypes.legacy;
      totalSegwit += blockData.transactionTypes.segwit;
      totalTaproot += blockData.transactionTypes.taproot;
      
      // For simplification, we use overall fee rates
      // In real implementation, you'd want to track fees by transaction type
      if (blockData.transactionTypes.legacy > 0) {
        legacyFees.push(...blockData.feeRates.slice(0, blockData.transactionTypes.legacy));
      }
      if (blockData.transactionTypes.segwit > 0) {
        segwitFees.push(...blockData.feeRates.slice(
          blockData.transactionTypes.legacy,
          blockData.transactionTypes.legacy + blockData.transactionTypes.segwit
        ));
      }
      if (blockData.transactionTypes.taproot > 0) {
        taprootFees.push(...blockData.feeRates.slice(-blockData.transactionTypes.taproot));
      }
    }

    const totalTransactions = totalLegacy + totalSegwit + totalTaproot;
    
    if (totalTransactions === 0) {
      return null;
    }

    const calculateAverage = (fees: number[]) => 
      fees.length > 0 ? fees.reduce((a, b) => a + b, 0) / fees.length : 0;

    return {
      activeFeatures,
      transactionTypeDistribution: {
        legacy: {
          count: totalLegacy,
          percentage: Math.round((totalLegacy / totalTransactions) * 100 * 100) / 100
        },
        segwit: {
          count: totalSegwit,
          percentage: Math.round((totalSegwit / totalTransactions) * 100 * 100) / 100
        },
        taproot: {
          count: totalTaproot,
          percentage: Math.round((totalTaproot / totalTransactions) * 100 * 100) / 100
        }
      },
      averageFeeByType: {
        legacy: Math.round(calculateAverage(legacyFees) * 100) / 100,
        segwit: Math.round(calculateAverage(segwitFees) * 100) / 100,
        taproot: Math.round(calculateAverage(taprootFees) * 100) / 100
      }
    };
  }

  /**
   * Get overall fee statistics from current state
   * Complexity: O(1)
   */  
  public getFeeStatistics(): {
    current: FeeRecommendations | null;
    historical: { [key: string]: number } | null;
    mempool: MempoolFeeData | null;
    activeFeatures: string[];
    dataQuality: {
      blockHistory: number;
      mempoolCoverage: number;
      confidence: string;
      lastUpdated: number;
    };
  } {
    const current = this.state.feeRecommendations;
    const historical = this.getHistoricalPercentiles();
    const mempool = this.state.currentMempoolAnalysis;
    const activeFeatures = this.state.activeFeatures;

    return {
      current,
      historical,
      mempool,
      activeFeatures,
      dataQuality: {
        blockHistory: this.state.blockHistory.size,
        mempoolCoverage: current?.mempoolCoverage || 0,
        confidence: current?.confidence || 'LOW',
        lastUpdated: current?.timestamp || 0
      }
    };
  }

  // Private utility method
  private getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.floor(sortedArray.length * percentile);
    return sortedArray[Math.min(index, sortedArray.length - 1)];
  }
}