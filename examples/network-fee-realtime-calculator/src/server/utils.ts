import { Block, Transaction, MempoolTransaction } from '@easylayer/bitcoin';

// Protocol activation heights
export const PROTOCOL_CHANGES = {
  SEGWIT_ACTIVATION: 481824,     // August 2017
  TAPROOT_ACTIVATION: 709632,    // November 2021
  // Add future protocol changes here
};

// Block fee analysis data structure
export interface BlockFeeData {
  blockHeight: number;
  blockHash: string;
  timestamp: number;
  
  // Basic statistics
  totalFees: number;
  totalTransactions: number;
  payingTransactions: number; // Excluding coinbase
  
  // Fee rate statistics (sat/vB)
  averageFeeRate: number;
  medianFeeRate: number;
  minFeeRate: number;
  maxFeeRate: number;
  feeRates: number[]; // All fee rates for detailed analysis
  
  // Fee rate percentiles
  percentiles: {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
  
  // Transaction type breakdown
  transactionTypes: {
    legacy: number;
    segwit: number;
    taproot: number;
    unknown: number;
  };
  
  // Block capacity metrics
  blockSize: number;
  blockWeight: number;
  witnessSize: number;
  capacityUtilization: number; // Percentage of max block weight used
  
  // Protocol features active at this height
  activeFeatures: string[];
}

// Mempool fee analysis data structure
export interface MempoolFeeData {
  timestamp: number;
  totalTransactions: number;
  
  // Fee rate distribution
  feeRateDistribution: {
    low: { range: [number, number]; count: number; totalFees: number };      // 0-10 sat/vB
    medium: { range: [number, number]; count: number; totalFees: number };   // 10-50 sat/vB  
    high: { range: [number, number]; count: number; totalFees: number };     // 50+ sat/vB
  };
  
  // Size distribution
  sizeDistribution: {
    small: { range: [number, number]; count: number };   // 0-250 vB
    medium: { range: [number, number]; count: number };  // 250-1000 vB
    large: { range: [number, number]; count: number };   // 1000+ vB
  };
  
  // Competition metrics
  averageFeeRate: number;
  medianFeeRate: number;
  
  // Mempool depth analysis
  estimatedBlocks: {
    nextBlock: number;        // Transactions likely in next block
    next3Blocks: number;      // Transactions likely in next 3 blocks
    next6Blocks: number;      // Transactions likely in next 6 blocks
  };
  
  // RBF analysis
  rbfTransactions: number;
  rbfPercentage: number;
  
  isSynchronized: boolean;
}

// Fee recommendations structure
export interface FeeRecommendations {
  timestamp: number;
  
  // Main recommendations (sat/vB)
  economy: number;     // 6+ blocks
  standard: number;    // 2-6 blocks  
  priority: number;    // Next block
  
  // Confidence levels
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  
  // Data quality indicators
  dataPoints: number;
  blockHistory: number;
  mempoolCoverage: number; // Percentage of mempool analyzed
  
  // Advanced estimates for different confirmation targets
  confirmationTargets: {
    1: number;   // Next block
    2: number;   // ~20 minutes
    3: number;   // ~30 minutes
    6: number;   // ~1 hour
    12: number;  // ~2 hours
    24: number;  // ~4 hours
    144: number; // ~24 hours
  };
}

// Fee estimate for specific target
export interface FeeEstimate {
  feeRate: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  targetBlocks: number;
}

// Get active protocol features at given block height
export function getActiveProtocolFeatures(blockHeight: number): string[] {
  const features: string[] = ['legacy'];
  
  if (blockHeight >= PROTOCOL_CHANGES.SEGWIT_ACTIVATION) {
    features.push('segwit');
  }
  
  if (blockHeight >= PROTOCOL_CHANGES.TAPROOT_ACTIVATION) {
    features.push('taproot');
  }
  
  return features;
}

// Determine transaction type based on protocol features and transaction data
export function determineTransactionType(
  tx: Transaction, 
  blockHeight: number
): 'legacy' | 'segwit' | 'taproot' | 'unknown' {
  if (isCoinbaseTransaction(tx)) {
    return 'unknown';
  }
  
  const activeFeatures = getActiveProtocolFeatures(blockHeight);
  
  // Check for Taproot (only if activated)
  if (activeFeatures.includes('taproot')) {
    // Taproot transactions typically have single witness element
    if (tx.vin?.some(vin => vin.txinwitness && vin.txinwitness.length === 1)) {
      return 'taproot';
    }
  }
  
  // Check for SegWit (only if activated)
  if (activeFeatures.includes('segwit')) {
    if (tx.vin?.some(vin => vin.txinwitness && vin.txinwitness.length > 0)) {
      return 'segwit';
    }
    if (tx.witnessSize && tx.witnessSize > 0) {
      return 'segwit';
    }
  }
  
  // Legacy transaction
  if (tx.vin && tx.vout && tx.vin.length > 0 && tx.vout.length > 0) {
    return 'legacy';
  }
  
  return 'unknown';
}

// Check if transaction is coinbase
export function isCoinbaseTransaction(tx: Transaction): boolean {
  return tx.vin.length > 0 && tx.vin.some(vin => vin.coinbase !== undefined);
}

// Analyze block fees
export function analyzeBlockFees(block: Block): BlockFeeData {
  const transactions = block.tx || [];
  
  // Filter paying transactions (exclude coinbase)
  const payingTransactions = transactions.filter(tx => {
    if (isCoinbaseTransaction(tx)) return false;
    return tx.fee !== undefined && tx.feeRate !== undefined && tx.fee > 0 && tx.feeRate > 0;
  });

  const feeRates = payingTransactions
    .map(tx => tx.feeRate!)
    .filter(rate => rate > 0);

  const totalFees = payingTransactions.reduce((sum, tx) => sum + (tx.fee || 0), 0);
  
  // Analyze transaction types
  const transactionTypes = {
    legacy: 0,
    segwit: 0,
    taproot: 0,
    unknown: 0
  };

  payingTransactions.forEach(tx => {
    const txType = determineTransactionType(tx, block.height);
    transactionTypes[txType]++;
  });
  
  // Calculate statistics
  let averageFeeRate = 0;
  let medianFeeRate = 0;
  let minFeeRate = 0;
  let maxFeeRate = 0;
  let percentiles = { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 };

  if (feeRates.length > 0) {
    const sortedRates = [...feeRates].sort((a, b) => a - b);
    averageFeeRate = feeRates.reduce((a, b) => a + b, 0) / feeRates.length;
    medianFeeRate = getPercentile(sortedRates, 0.5);
    minFeeRate = sortedRates[0];
    maxFeeRate = sortedRates[sortedRates.length - 1];
    
    percentiles = {
      p10: getPercentile(sortedRates, 0.10),
      p25: getPercentile(sortedRates, 0.25),
      p50: getPercentile(sortedRates, 0.50),
      p75: getPercentile(sortedRates, 0.75),
      p90: getPercentile(sortedRates, 0.90),
      p95: getPercentile(sortedRates, 0.95),
      p99: getPercentile(sortedRates, 0.99),
    };
  }

  // Calculate capacity utilization (max block weight is 4M weight units)
  const MAX_BLOCK_WEIGHT = 4000000;
  const capacityUtilization = block.weight ? (block.weight / MAX_BLOCK_WEIGHT) * 100 : 0;

  return {
    blockHeight: block.height,
    blockHash: block.hash,
    timestamp: block.time,
    totalFees,
    totalTransactions: transactions.length,
    payingTransactions: payingTransactions.length,
    averageFeeRate,
    medianFeeRate,
    minFeeRate,
    maxFeeRate,
    feeRates,
    percentiles,
    transactionTypes,
    blockSize: block.size || 0,
    blockWeight: block.weight || 0,
    witnessSize: block.witnessSize || 0,
    capacityUtilization,
    activeFeatures: getActiveProtocolFeatures(block.height)
  };
}

// Analyze mempool fees
export function analyzeMempoolFees(data: {
  totalTransactions: number;
  lowFeeTransactions: Array<{ txid: string; transaction: MempoolTransaction; feeRate: number }>;
  mediumFeeTransactions: Array<{ txid: string; transaction: MempoolTransaction; feeRate: number }>;
  highFeeTransactions: Array<{ txid: string; transaction: MempoolTransaction; feeRate: number }>;
  smallTransactions: Array<{ txid: string; transaction: MempoolTransaction; size: number }>;
  mediumTransactions: Array<{ txid: string; transaction: MempoolTransaction; size: number }>;
  largeTransactions: Array<{ txid: string; transaction: MempoolTransaction; size: number }>;
  isSynchronized: boolean;
}): MempoolFeeData {
  
  const { lowFeeTransactions, mediumFeeTransactions, highFeeTransactions } = data;
  const { smallTransactions, mediumTransactions, largeTransactions } = data;
  
  // Calculate fee rate distribution
  const feeRateDistribution = {
    low: {
      range: [0, 10] as [number, number],
      count: lowFeeTransactions.length,
      totalFees: lowFeeTransactions.reduce((sum, tx) => sum + tx.transaction.fee, 0)
    },
    medium: {
      range: [10, 50] as [number, number],
      count: mediumFeeTransactions.length,
      totalFees: mediumFeeTransactions.reduce((sum, tx) => sum + tx.transaction.fee, 0)
    },
    high: {
      range: [50, Infinity] as [number, number],
      count: highFeeTransactions.length,
      totalFees: highFeeTransactions.reduce((sum, tx) => sum + tx.transaction.fee, 0)
    }
  };
  
  // Calculate size distribution
  const sizeDistribution = {
    small: {
      range: [0, 250] as [number, number],
      count: smallTransactions.length
    },
    medium: {
      range: [250, 1000] as [number, number],
      count: mediumTransactions.length
    },
    large: {
      range: [1000, Infinity] as [number, number],
      count: largeTransactions.length
    }
  };
  
  // Calculate overall statistics
  const allTransactions = [...lowFeeTransactions, ...mediumFeeTransactions, ...highFeeTransactions];
  const allFeeRates = allTransactions.map(tx => tx.feeRate);
  
  const averageFeeRate = allFeeRates.length > 0 
    ? allFeeRates.reduce((a, b) => a + b, 0) / allFeeRates.length 
    : 0;
  
  const sortedFeeRates = [...allFeeRates].sort((a, b) => a - b);
  const medianFeeRate = sortedFeeRates.length > 0 
    ? getPercentile(sortedFeeRates, 0.5) 
    : 0;
  
  // Estimate blocks for confirmation (simplified logic)
  const AVERAGE_BLOCK_CAPACITY = 3000; // Average transactions per block
  const nextBlock = Math.min(highFeeTransactions.length, AVERAGE_BLOCK_CAPACITY);
  const next3Blocks = Math.min(
    highFeeTransactions.length + mediumFeeTransactions.length, 
    AVERAGE_BLOCK_CAPACITY * 3
  );
  const next6Blocks = Math.min(
    allTransactions.length, 
    AVERAGE_BLOCK_CAPACITY * 6
  );
  
  // RBF analysis
  const rbfTransactions = allTransactions.filter(tx => tx.transaction.bip125_replaceable).length;
  const rbfPercentage = allTransactions.length > 0 
    ? (rbfTransactions / allTransactions.length) * 100 
    : 0;

  return {
    timestamp: Date.now(),
    totalTransactions: data.totalTransactions,
    feeRateDistribution,
    sizeDistribution,
    averageFeeRate,
    medianFeeRate,
    estimatedBlocks: {
      nextBlock,
      next3Blocks,
      next6Blocks
    },
    rbfTransactions,
    rbfPercentage,
    isSynchronized: data.isSynchronized
  };
}

// Calculate fee recommendations based on historical and mempool data
export function calculateFeeRecommendations(
  blockHistory: BlockFeeData[],
  mempoolAnalysis: MempoolFeeData | null,
  activeFeatures: string[]
): FeeRecommendations {
  
  // Collect all fee rates from recent blocks
  const allHistoricalFeeRates: number[] = [];
  let totalDataPoints = 0;
  
  blockHistory.forEach(block => {
    allHistoricalFeeRates.push(...block.feeRates);
    totalDataPoints += block.payingTransactions;
  });
  
  // Default recommendations
  let economy = 1;
  let standard = 5;
  let priority = 15;
  
  // Calculate from historical data
  if (allHistoricalFeeRates.length > 0) {
    const sortedRates = [...allHistoricalFeeRates].sort((a, b) => a - b);
    
    economy = Math.max(getPercentile(sortedRates, 0.25), 1);
    standard = Math.max(getPercentile(sortedRates, 0.50), 5);
    priority = Math.max(getPercentile(sortedRates, 0.75), 15);
  }
  
  // Adjust with mempool data if available
  if (mempoolAnalysis && mempoolAnalysis.isSynchronized) {
    // Use mempool data to refine recommendations
    const mempoolMedian = mempoolAnalysis.medianFeeRate;
    const mempoolAverage = mempoolAnalysis.averageFeeRate;
    
    // Weight mempool data higher for recent recommendations
    const historicalWeight = 0.6;
    const mempoolWeight = 0.4;
    
    if (mempoolMedian > 0) {
      economy = Math.max(
        (economy * historicalWeight) + (mempoolMedian * 0.8 * mempoolWeight),
        1
      );
      
      standard = Math.max(
        (standard * historicalWeight) + (mempoolMedian * mempoolWeight),
        5
      );
      
      priority = Math.max(
        (priority * historicalWeight) + (mempoolAverage * 1.2 * mempoolWeight),
        15
      );
    }
    
    // If mempool has high competition, increase priority fee
    const highFeeRatio = mempoolAnalysis.feeRateDistribution.high.count / 
                        Math.max(mempoolAnalysis.totalTransactions, 1);
    
    if (highFeeRatio > 0.3) { // More than 30% high fee transactions
      priority *= 1.5;
    }
  }
  
  // Determine confidence level
  const confidence = getConfidenceLevel(blockHistory.length, totalDataPoints, mempoolAnalysis);
  
  // Calculate confirmation target estimates
  const confirmationTargets: any = calculateConfirmationTargets(
    blockHistory,
    mempoolAnalysis,
    { economy, standard, priority }
  );
  
  return {
    timestamp: Date.now(),
    economy: Math.round(economy * 100) / 100,
    standard: Math.round(standard * 100) / 100,
    priority: Math.round(priority * 100) / 100,
    confidence,
    dataPoints: totalDataPoints,
    blockHistory: blockHistory.length,
    mempoolCoverage: mempoolAnalysis ? 
      (mempoolAnalysis.totalTransactions > 0 ? 100 : 0) : 0,
    confirmationTargets
  };
}

// Calculate fee estimates for different confirmation targets
function calculateConfirmationTargets(
  blockHistory: BlockFeeData[],
  mempoolAnalysis: MempoolFeeData | null,
  baseRates: { economy: number; standard: number; priority: number }
): { [key: number]: number } {
  
  // Base multipliers for different confirmation targets
  const multipliers = {
    1: 1.2,   // Next block - higher fee
    2: 1.0,   // 2 blocks - standard
    3: 0.9,   // 3 blocks - slightly lower
    6: 0.8,   // 1 hour - economy
    12: 0.7,  // 2 hours - lower
    24: 0.6,  // 4 hours - much lower
    144: 0.5  // 24 hours - minimum
  };
  
  const result: { [key: number]: number } = {};
  
  // If we have good historical data, use percentiles
  if (blockHistory.length >= 10) {
    const allFeeRates: number[] = [];
    blockHistory.forEach(block => allFeeRates.push(...block.feeRates));
    
    if (allFeeRates.length > 0) {
      const sortedRates = [...allFeeRates].sort((a, b) => a - b);
      
      result[1] = Math.max(getPercentile(sortedRates, 0.90), baseRates.priority);
      result[2] = Math.max(getPercentile(sortedRates, 0.75), baseRates.standard);
      result[3] = Math.max(getPercentile(sortedRates, 0.60), baseRates.standard * 0.9);
      result[6] = Math.max(getPercentile(sortedRates, 0.50), baseRates.economy);
      result[12] = Math.max(getPercentile(sortedRates, 0.40), baseRates.economy * 0.8);
      result[24] = Math.max(getPercentile(sortedRates, 0.30), baseRates.economy * 0.6);
      result[144] = Math.max(getPercentile(sortedRates, 0.20), 1);
    } else {
      // Fallback to multipliers
      Object.entries(multipliers).forEach(([blocks, multiplier]) => {
        result[parseInt(blocks)] = Math.max(baseRates.standard * multiplier, 1);
      });
    }
  } else {
    // Use multipliers when not enough historical data
    Object.entries(multipliers).forEach(([blocks, multiplier]) => {
      result[parseInt(blocks)] = Math.max(baseRates.standard * multiplier, 1);
    });
  }
  
  // Round all values
  Object.keys(result).forEach(key => {
    result[parseInt(key)] = Math.round(result[parseInt(key)] * 100) / 100;
  });
  
  return result;
}

// Determine confidence level based on data quality
function getConfidenceLevel(
  blockCount: number, 
  txCount: number, 
  mempoolAnalysis: MempoolFeeData | null
): 'LOW' | 'MEDIUM' | 'HIGH' {
  
  let score = 0;
  
  // Historical data quality
  if (blockCount >= 20 && txCount >= 2000) score += 3;
  else if (blockCount >= 10 && txCount >= 500) score += 2;
  else if (blockCount >= 5 && txCount >= 100) score += 1;
  
  // Mempool data quality
  if (mempoolAnalysis && mempoolAnalysis.isSynchronized) {
    if (mempoolAnalysis.totalTransactions >= 1000) score += 2;
    else if (mempoolAnalysis.totalTransactions >= 100) score += 1;
  }
  
  // Return confidence based on score
  if (score >= 4) return 'HIGH';
  if (score >= 2) return 'MEDIUM';
  return 'LOW';
}

// Utility function to get percentile from sorted array
function getPercentile(sortedArray: number[], percentile: number): number {
  if (sortedArray.length === 0) return 0;
  const index = Math.floor(sortedArray.length * percentile);
  return sortedArray[Math.min(index, sortedArray.length - 1)];
}

// Utility function to calculate average
function average(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

// Advanced fee calculation for specific transaction characteristics
export function calculateFeeForTransaction(
  txSize: number,
  txWeight: number,
  targetBlocks: number,
  recommendations: FeeRecommendations,
  txType: 'legacy' | 'segwit' | 'taproot' = 'segwit'
): {
  totalFee: number;
  feeRate: number;
  effectiveSize: number;
} {
  
  // Use vsize for fee calculation (weight / 4 for SegWit transactions)
  const effectiveSize = txType === 'legacy' ? txSize : Math.ceil(txWeight / 4);
  
  // Get fee rate for target blocks
  let feeRate: number;
  
  if (targetBlocks === 1) {
    feeRate = recommendations.priority;
  } else if (targetBlocks <= 3) {
    feeRate = recommendations.standard;
  } else if (targetBlocks <= 6) {
    feeRate = recommendations.economy;
  } else {
    // Use confirmation targets if available
    const targetFee = recommendations.confirmationTargets[targetBlocks];
    feeRate = targetFee || recommendations.economy * 0.8;
  }
  
  const totalFee = Math.ceil(effectiveSize * feeRate);
  
  return {
    totalFee,
    feeRate,
    effectiveSize
  };
}

// Check if fee rate is competitive for target confirmation time
export function isFeeCompetitive(
  feeRate: number,
  targetBlocks: number,
  recommendations: FeeRecommendations,
  mempoolAnalysis: MempoolFeeData | null
): {
  isCompetitive: boolean;
  competitiveness: 'LOW' | 'MEDIUM' | 'HIGH';
  suggestedFeeRate: number;
} {
  
  const targetFeeRate = recommendations.confirmationTargets[targetBlocks] || 
                       recommendations.standard;
  
  const isCompetitive = feeRate >= targetFeeRate * 0.9; // 90% of target
  
  let competitiveness: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
  
  if (feeRate >= targetFeeRate * 1.2) {
    competitiveness = 'HIGH';
  } else if (feeRate < targetFeeRate * 0.7) {
    competitiveness = 'LOW';
  }
  
  // Adjust based on mempool conditions
  if (mempoolAnalysis) {
    const highFeeRatio = mempoolAnalysis.feeRateDistribution.high.count / 
                        Math.max(mempoolAnalysis.totalTransactions, 1);
    
    if (highFeeRatio > 0.4 && competitiveness !== 'HIGH') {
      competitiveness = 'LOW';
    }
  }
  
  return {
    isCompetitive,
    competitiveness,
    suggestedFeeRate: targetFeeRate
  };
}