import { Block, Transaction } from '@easylayer/bitcoin';

export interface FeeData {
  totalFees: number;
  transactionCount: number;
  payingTransactionCount: number;
  avgFeeRate: number;
  medianFeeRate: number;
  feeRates: number[];
  percentiles: {
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
  };
  // Track different transaction types for historical analysis
  legacyTxCount: number;
  segwitTxCount: number;
  taprootTxCount: number;
  // Block capacity metrics that changed over time
  blockSize: number;
  blockWeight: number;
  witnessSize: number;
}

// Bitcoin protocol changes that affect fees
const PROTOCOL_CHANGES = {
  SEGWIT_ACTIVATION: 481824,     // August 2017
  TAPROOT_ACTIVATION: 709632,    // November 2021
  // Add other significant changes that affect fee calculation
};

export function getActiveFeatures(blockHeight: number): string[] {
  const features: string[] = ['legacy'];
  
  if (blockHeight >= PROTOCOL_CHANGES.SEGWIT_ACTIVATION) {
    features.push('segwit');
  }
  
  if (blockHeight >= PROTOCOL_CHANGES.TAPROOT_ACTIVATION) {
    features.push('taproot');
  }
  
  return features;
}

export function determineTransactionType(tx: Transaction, blockHeight: number): 'legacy' | 'segwit' | 'taproot' | 'unknown' {
  if (isCoinbaseTransaction(tx)) {
    return 'unknown';
  }
  
  const activeFeatures = getActiveFeatures(blockHeight);
  
  // Check for Taproot (only if activated)
  if (activeFeatures.includes('taproot') && 
      tx.vin?.some(vin => vin.txinwitness && vin.txinwitness.length === 1)) {
    return 'taproot';
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

export interface FeeRecommendations {
  economy: number;    // sat/vB
  standard: number;   // sat/vB  
  priority: number;   // sat/vB
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  dataPoints: number;
  lastUpdated: number;
}

export function isCoinbaseTransaction(tx: Transaction): boolean {
  return tx.vin.length > 0 && tx.vin.some(vin => vin.coinbase !== undefined);
}

export function analyzeBlockFees(block: Block): FeeData {
  const transactions = block.tx || [];
  
  // Filter paying transactions (exclude coinbase)
  const payingTransactions = transactions.filter(tx => {
    if (isCoinbaseTransaction(tx)) return false;
    return tx.fee && tx.feeRate && tx.fee > 0 && tx.feeRate > 0;
  });

  const feeRates = payingTransactions
    .map(tx => tx.feeRate!)
    .filter(rate => rate > 0);

  const totalFees = payingTransactions.reduce((sum, tx) => sum + (tx.fee || 0), 0);
  
  // Analyze transaction types based on block height
  let legacyTxCount = 0;
  let segwitTxCount = 0;
  let taprootTxCount = 0;

  payingTransactions.forEach(tx => {
    const txType = determineTransactionType(tx, block.height);
    switch (txType) {
      case 'legacy': legacyTxCount++; break;
      case 'segwit': segwitTxCount++; break;
      case 'taproot': taprootTxCount++; break;
    }
  });
  
  let avgFeeRate = 0;
  let medianFeeRate = 0;
  let percentiles = { p25: 0, p50: 0, p75: 0, p90: 0, p95: 0 };

  if (feeRates.length > 0) {
    const sortedRates = [...feeRates].sort((a, b) => a - b);
    avgFeeRate = feeRates.reduce((a, b) => a + b, 0) / feeRates.length;
    medianFeeRate = getPercentile(sortedRates, 0.5);
    
    percentiles = {
      p25: getPercentile(sortedRates, 0.25),
      p50: getPercentile(sortedRates, 0.50),
      p75: getPercentile(sortedRates, 0.75),
      p90: getPercentile(sortedRates, 0.90),
      p95: getPercentile(sortedRates, 0.95),
    };
  }

  return {
    totalFees,
    transactionCount: transactions.length,
    payingTransactionCount: payingTransactions.length,
    avgFeeRate,
    medianFeeRate,
    feeRates,
    percentiles,
    legacyTxCount,
    segwitTxCount,
    taprootTxCount,
    blockSize: block.size || 0,
    blockWeight: block.weight || 0,
    witnessSize: block.witnessSize || 0
  };
}

export function calculateFeeRecommendations(blockHistory: FeeData[]): FeeRecommendations {
  // Collect all fee rates from recent blocks
  const allFeeRates: number[] = [];
  let totalDataPoints = 0;
  
  blockHistory.slice(-20).forEach(block => { // Last 20 blocks
    // Use feeRates array from FeeData
    if (block.feeRates && block.feeRates.length > 0) {
      allFeeRates.push(...block.feeRates);
    }
    totalDataPoints += block.transactionCount || 0;
  });

  if (allFeeRates.length === 0) {
    // Fallback to percentiles if no raw fee rates available
    const recentBlocks = blockHistory.slice(-10);
    const medianFees = recentBlocks.map(b => b.medianFeeRate).filter(f => f > 0);
    const p75Fees = recentBlocks.map(b => b.percentiles?.p75 || b.medianFeeRate).filter(f => f > 0);
    const p95Fees = recentBlocks.map(b => b.percentiles?.p95 || b.medianFeeRate * 2).filter(f => f > 0);

    if (medianFees.length > 0) {
      return {
        economy: Math.max(average(medianFees), 1),
        standard: Math.max(average(p75Fees), 5),
        priority: Math.max(average(p95Fees), 15),
        confidence: getConfidence(blockHistory.length, totalDataPoints),
        dataPoints: totalDataPoints,
        lastUpdated: Date.now()
      };
    }
  } else {
    const sortedRates = allFeeRates.sort((a, b) => a - b);
    
    return {
      economy: Math.max(getPercentile(sortedRates, 0.50), 1),  // 50th percentile
      standard: Math.max(getPercentile(sortedRates, 0.75), 5), // 75th percentile  
      priority: Math.max(getPercentile(sortedRates, 0.90), 15), // 90th percentile
      confidence: getConfidence(blockHistory.length, totalDataPoints),
      dataPoints: totalDataPoints,
      lastUpdated: Date.now()
    };
  }

  // Fallback
  return {
    economy: 5,
    standard: 15,
    priority: 30,
    confidence: 'LOW',
    dataPoints: 0,
    lastUpdated: Date.now()
  };
}

function getPercentile(sortedArray: number[], percentile: number): number {
  if (sortedArray.length === 0) return 0;
  const index = Math.floor(sortedArray.length * percentile);
  return sortedArray[Math.min(index, sortedArray.length - 1)];
}

function average(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function getConfidence(blockCount: number, txCount: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (blockCount >= 20 && txCount >= 1000) return 'HIGH';
  if (blockCount >= 10 && txCount >= 100) return 'MEDIUM';
  return 'LOW';
}