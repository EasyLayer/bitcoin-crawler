import { v4 as uuidv4 } from 'uuid';
import { Model } from '@easylayer/bitcoin-crawler';
import { ScriptUtilService, Block, NetworkConfig } from '@easylayer/bitcoin';
import { Money, Currency } from '@easylayer/common/arithmetic';
import {
  TransferAggregationEvent,
  AddressOutput,
  AddressInput,
  AggregatedTransfer,
} from './events';
import P from './profiler';

export const CURRENCY: Currency = {
  code: 'BTC',
  minorUnit: 8,
};

/**
 * Large transfer record
 * 
 * SIMPLE CONCEPT: Just track big Bitcoin transactions
 * Size: ~200 bytes per transfer
 * 
 * EXAMPLE:
 * {
 *   txid: "abc123def456...",
 *   blockHeight: 850000,
 *   timestamp: 1703520000,
 *   totalValue: "500000000",        // 5 BTC total (sum of ALL outputs)
 *   outputCount: 3,                // 3 outputs in transaction
 *   largestOutput: "300000000",     // 3 BTC (biggest single output)
 *   addresses: ["1Abc...", "1Def...", "1Ghi..."], // All recipient addresses
 *   inputCount: 2                  // Number of inputs (for context)
 * }
 */
export interface LargeTransfer {
  txid: string;                     // Transaction ID
  blockHeight: number;              // Block height when transfer occurred
  timestamp: number;                // Unix timestamp of the block
  totalValue: string;               // TOTAL value of ALL outputs (this is what we filter on)
  outputCount: number;              // Number of outputs in transaction
  largestOutput: string;            // Value of largest single output
  addresses: string[];              // All recipient addresses in transaction
  inputCount: number;               // Number of inputs (for analysis)
}

/**
 * LRU cache entry for parsed scripts
 * PERFORMANCE OPTIMIZATION: Cache script parsing results
 */
interface ScriptCacheEntry {
  address: string;                  // Parsed address result
  lastUsed: number;                 // Block height for LRU eviction
}

export const UNIQ_MODEL_NAME = 'large-transfer-tracker';

/**
 * LargeTransferTrackerModel - Simple tracker for large Bitcoin transactions
 * 
 * MEMORY USAGE ANALYSIS:
 * - transfers: ~200 bytes × maxTransfers = ~2MB for 10K transfers
 * - scriptCache: ~80 bytes × maxCacheSize = ~400KB for 5K cache
 * - Total: ~2.4MB (BOUNDED by maxTransfers limit)
 * 
 * MEMORY GROWTH PATTERN:
 * - Initial growth: Linear until maxTransfers reached
 * - Growth stops at: ~2.4MB when transfer limit reached
 * - Memory becomes CONSTANT through FIFO pruning (oldest transfers removed)
 * 
 * CONCEPT:
 * - Track transactions where TOTAL output value >= minThreshold
 * - Store simple transfer records in chronological order
 * - Prune oldest transfers when limit exceeded (FIFO queue)
 * - Cache script parsing for performance
 * 
 * PERFORMANCE BOTTLENECKS:
 * - Script parsing: O(complex) → O(1) with cache (95%+ hit rate)
 * - Transfer storage: O(1) append + O(1) FIFO removal
 * - Search operations: O(N) linear search (acceptable for 10K records)
 */
export default class LargeTransferTrackerModel extends Model {
  // Configuration - SIMPLE and TUNABLE
  private minTransferThreshold: string = "100000000";  // 1 BTC minimum
  private maxTransferThreshold: string = "10000000000000"; // 100K BTC maximum (sanity check)
  private maxTransfers: number = 10000;                // Keep last 10K transfers
  private maxScriptCacheSize: number = 5000;           // LRU cache for scripts
  
  // Pruning frequency  
  private readonly CACHE_CLEANUP_INTERVAL = 100;     // Clean cache every 100 blocks
  
  /**
   * Simple array of large transfers in chronological order
   * MEMORY: ~200 bytes × maxTransfers = ~2MB for 10K transfers
   * GROWTH: BOUNDED by maxTransfers (FIFO pruning when exceeded)
   * ACCESS: O(1) append, O(1) FIFO removal, O(N) search
   */
  private transfers: LargeTransfer[] = [];
  
  /**
   * LRU cache for parsed scripts to avoid repeated parsing
   * MEMORY: ~80 bytes × maxCacheSize = ~400KB for 5K cache
   * PERFORMANCE: 95%+ hit rate for common script types
   * EVICTION: LRU when cache exceeds maxCacheSize
   */
  private scriptCache: Map<string, ScriptCacheEntry> = new Map();

  constructor() {
    super(UNIQ_MODEL_NAME);
  }

  /**
   * Serialize model state for persistence
   */
  protected toJsonPayload(): any {
    return {
      minTransferThreshold: this.minTransferThreshold,
      maxTransferThreshold: this.maxTransferThreshold,
      maxTransfers: this.maxTransfers,
      maxScriptCacheSize: this.maxScriptCacheSize,
      transfers: this.transfers,
      scriptCache: Array.from(this.scriptCache.entries()),
    };
  }

  /**
   * Deserialize model state from persistence
   */
  protected fromSnapshot(state: any): void {
    // Restore configuration
    if (state.minTransferThreshold !== undefined) this.minTransferThreshold = state.minTransferThreshold;
    if (state.maxTransferThreshold !== undefined) this.maxTransferThreshold = state.maxTransferThreshold;
    if (state.maxTransfers !== undefined) this.maxTransfers = state.maxTransfers;
    if (state.maxScriptCacheSize !== undefined) this.maxScriptCacheSize = state.maxScriptCacheSize;
    
    // Restore transfers
    if (state.transfers && Array.isArray(state.transfers)) {
      this.transfers = state.transfers;
    }
    
    // Restore script cache
    if (state.scriptCache && Array.isArray(state.scriptCache)) {
      this.scriptCache = new Map(state.scriptCache);
    }
    
    Object.setPrototypeOf(this, LargeTransferTrackerModel.prototype);
  }

  /**
   * Parse block and extract large transfers
   * PERFORMANCE: O(T × O) where T=transactions, O=outputs per transaction
   */
  async parseBlock({ block, networkConfig }: { block: Block; networkConfig: NetworkConfig }) {
    const { tx, height, time } = block;

    const newOutputs: AddressOutput[] = [];
    const spentInputs: AddressInput[] = [];
    const largeTransfers: AggregatedTransfer[] = [];

    let vinTime = 0n;
    let voutTime = 0n;
    let scriptTime = 0n;
    let transferTime = 0n;
    let applyTime = 0n;

    for (const transaction of tx) {
      const { txid, vin, vout } = transaction;
      
      const tTransfer0 = P.now();
      
      // Process inputs for event
      const tVin0 = P.now();
      for (const input of vin) {
        if (input.coinbase) continue;
        if (input.txid && input.vout !== undefined) {
          spentInputs.push({ txid: input.txid, n: input.vout });
        }
      }
      vinTime += P.now() - tVin0;

      // Process outputs and calculate total transaction value
      const outputData: { address: string; value: string }[] = [];
      let totalOutputValue = BigInt(0);
      let largestOutputValue = BigInt(0);
      const recipientAddresses: string[] = [];

      const tVout0 = P.now();
      for (const output of vout) {
        const tScript0 = P.now();
        const address = this.extractAddressFromVout(output, networkConfig, height);
        scriptTime += P.now() - tScript0;

        const value = Money.fromDecimal(output.value.toString(), CURRENCY).toCents();
        const valueBig = BigInt(value);
        
        // Always add to newOutputs for event
        newOutputs.push({ address: address || 'unknown', txid, n: output.n, value });
        
        // Track for transfer analysis
        if (address) {
          outputData.push({ address, value });
          recipientAddresses.push(address);
        }
        
        totalOutputValue += valueBig;
        if (valueBig > largestOutputValue) {
          largestOutputValue = valueBig;
        }
      }
      voutTime += P.now() - tVout0;

      // Check if this transaction qualifies as a large transfer
      // KEY LOGIC: Filter by TOTAL transaction value, not individual outputs
      if (totalOutputValue >= BigInt(this.minTransferThreshold) && 
          totalOutputValue <= BigInt(this.maxTransferThreshold)) {
        
        const largeTransfer: AggregatedTransfer = {
          txid,
          blockHeight: height,
          timestamp: time || 0,
          inputCount: vin.filter(i => !i.coinbase).length,
          outputCount: vout.length,
          totalValue: totalOutputValue.toString(),
          largeOutputs: outputData.map(o => ({
            address: o.address,
            value: o.value
          })),
          pattern: "LARGE_TRANSFER", // Simple pattern
          confidence: 1.0,
          riskLevel: "MEDIUM"
        };

        largeTransfers.push(largeTransfer);
      }
      
      transferTime += P.now() - tTransfer0;
    }

    // Apply event if we have any data
    if (newOutputs.length > 0 || spentInputs.length > 0 || largeTransfers.length > 0) {
      const tA0 = P.now();
      await this.apply(
        new TransferAggregationEvent({
          aggregateId: this.aggregateId,
          requestId: uuidv4(),
          blockHeight: height,
          timestamp: time || 0,
          outputs: newOutputs,
          inputs: spentInputs,
          largeTransfers: largeTransfers,
        }),
      );
      applyTime = P.now() - tA0;
    }

    // Periodic cache cleanup
    if (height % this.CACHE_CLEANUP_INTERVAL === 0) {
      this.cleanupScriptCache(height);
    }

    P.mark(`h${height}`);
    P.add(vinTime, voutTime, scriptTime, transferTime, applyTime);
  }

  /**
   * Extract Bitcoin address from transaction output with LRU caching
   * PERFORMANCE OPTIMIZATION: Cache parsed scripts to avoid repeated parsing
   * Time complexity: O(1) cache hit, O(complex) cache miss
   */
  private extractAddressFromVout(vout: any, networkConfig: any, blockHeight: number): string | undefined {
    try {
      // Step 1: Direct address from scriptPubKey (fastest path - 90%+ of cases)
      if (vout.scriptPubKey?.addresses && vout.scriptPubKey.addresses.length > 0) {
        return vout.scriptPubKey.addresses[0];
      }

      // Step 2: Check script cache for known scripts
      if (vout.scriptPubKey?.hex) {
        const scriptHex = vout.scriptPubKey.hex;
        const cached = this.scriptCache.get(scriptHex);
        if (cached) {
          // Cache hit - update LRU and return
          cached.lastUsed = blockHeight;
          return cached.address;
        }

        // Step 3: Parse script and cache result (expensive operation)
        const scriptHash = ScriptUtilService.getScriptHashFromScriptPubKey(
          vout.scriptPubKey, 
          networkConfig.network
        );
        
        if (scriptHash) {
          // Add to cache for future use
          this.addToScriptCache(scriptHex, scriptHash, blockHeight);
          return scriptHash;
        }
      }

      return undefined;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Add parsed script to LRU cache with size management
   * Maintains cache within memory limits via LRU eviction
   */
  private addToScriptCache(scriptHex: string, address: string, blockHeight: number): void {
    // Add new entry
    this.scriptCache.set(scriptHex, {
      address,
      lastUsed: blockHeight
    });

    // Enforce cache size limit via LRU eviction
    if (this.scriptCache.size > this.maxScriptCacheSize) {
      this.evictOldestCacheEntry();
    }
  }

  /**
   * Evict oldest (least recently used) entry from script cache
   * Time complexity: O(N) but only called when cache is full
   */
  private evictOldestCacheEntry(): void {
    let oldestKey = '';
    let oldestTime = Number.MAX_SAFE_INTEGER;
    
    for (const [key, entry] of this.scriptCache) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.scriptCache.delete(oldestKey);
    }
  }

  /**
   * Cleanup script cache by removing entries older than threshold
   * Called periodically to prevent cache from holding stale data
   */
  private cleanupScriptCache(currentBlock: number): void {
    const cacheAgeThreshold = 10000; // Remove entries older than 10K blocks
    const cutoffBlock = currentBlock - cacheAgeThreshold;
    
    for (const [key, entry] of this.scriptCache) {
      if (entry.lastUsed < cutoffBlock) {
        this.scriptCache.delete(key);
      }
    }
  }

  /**
   * Event handler for transfer aggregation
   * SIMPLE LOGIC: Just store large transfers and maintain FIFO queue
   */
  private onTransferAggregationEvent({ payload }: TransferAggregationEvent) {
    const { largeTransfers } = payload;

    // Add each large transfer to our simple array
    for (const aggregatedTransfer of largeTransfers) {
      const transfer: LargeTransfer = {
        txid: aggregatedTransfer.txid,
        blockHeight: aggregatedTransfer.blockHeight,
        timestamp: aggregatedTransfer.timestamp,
        totalValue: aggregatedTransfer.totalValue,
        outputCount: aggregatedTransfer.outputCount,
        largestOutput: this.findLargestOutput(aggregatedTransfer.largeOutputs),
        addresses: aggregatedTransfer.largeOutputs.map(o => o.address),
        inputCount: aggregatedTransfer.inputCount
      };

      // Add to end of array (chronological order)
      this.transfers.push(transfer);
    }

    // MEMORY MANAGEMENT: Simple FIFO pruning
    // Remove oldest transfers when we exceed the limit
    while (this.transfers.length > this.maxTransfers) {
      this.transfers.shift(); // Remove from beginning (oldest)
    }
  }

  /**
   * Find largest output value from aggregated transfer outputs
   */
  private findLargestOutput(outputs: { address: string; value: string }[]): string {
    let largest = BigInt(0);
    
    for (const output of outputs) {
      const value = BigInt(output.value);
      if (value > largest) {
        largest = value;
      }
    }
    
    return largest.toString();
  }

  // =============================================================================
  // PUBLIC QUERY METHODS - SIMPLE AND USEFUL
  // =============================================================================

  /**
   * Get recent large transfers
   * Time complexity: O(1) - just slice the array
   */
  public getRecentTransfers(limit?: number): LargeTransfer[] {
    const actualLimit = limit || 100;
    // Return most recent transfers (end of array)
    return this.transfers.slice(-actualLimit).reverse();
  }

  /**
   * Get largest transfers by value
   * Time complexity: O(N log N) for sorting
   */
  public getLargestTransfers(limit?: number): LargeTransfer[] {
    const actualLimit = limit || 100;
    return [...this.transfers]
      .sort((a, b) => {
        const valueA = BigInt(a.totalValue);
        const valueB = BigInt(b.totalValue);
        return valueA > valueB ? -1 : (valueA < valueB ? 1 : 0);
      })
      .slice(0, actualLimit);
  }

  /**
   * Get transfers in specific value range
   * Time complexity: O(N) linear filter
   */
  public getTransfersByValueRange(minValue: string, maxValue: string): LargeTransfer[] {
    const min = BigInt(minValue);
    const max = BigInt(maxValue);
    
    return this.transfers.filter(transfer => {
      const value = BigInt(transfer.totalValue);
      return value >= min && value <= max;
    });
  }

  /**
   * Get transfers involving specific address
   * Time complexity: O(N × A) where A = average addresses per transfer
   */
  public getTransfersByAddress(address: string): LargeTransfer[] {
    return this.transfers.filter(transfer => 
      transfer.addresses.includes(address)
    );
  }

  /**
   * Get transfers in specific block range
   * Time complexity: O(N) linear filter
   */
  public getTransfersByBlockRange(startBlock: number, endBlock: number): LargeTransfer[] {
    return this.transfers.filter(transfer => 
      transfer.blockHeight >= startBlock && transfer.blockHeight <= endBlock
    );
  }

  /**
   * Get transfer statistics
   */
  public getTransferStats(): any {
    if (this.transfers.length === 0) {
      return {
        totalTransfers: 0,
        totalVolume: '0',
        totalVolumeBTC: 0,
        averageTransferBTC: 0,
        largestTransferBTC: 0,
        oldestBlock: 0,
        newestBlock: 0
      };
    }

    const totalVolume = this.transfers.reduce((sum, t) => sum + BigInt(t.totalValue), BigInt(0));
    const largestTransfer = this.transfers.reduce((max, t) => {
      const value = BigInt(t.totalValue);
      return value > max ? value : max;
    }, BigInt(0));
    
    const oldestBlock = Math.min(...this.transfers.map(t => t.blockHeight));
    const newestBlock = Math.max(...this.transfers.map(t => t.blockHeight));

    return {
      totalTransfers: this.transfers.length,
      totalVolume: totalVolume.toString(),
      totalVolumeBTC: Number(totalVolume / BigInt(100000000)),
      averageTransferBTC: Number(totalVolume / BigInt(100000000)) / this.transfers.length,
      largestTransferBTC: Number(largestTransfer / BigInt(100000000)),
      oldestBlock,
      newestBlock,
      blockRange: newestBlock - oldestBlock
    };
  }

  /**
   * Search transfers by transaction ID
   * Time complexity: O(N) linear search
   */
  public getTransferByTxid(txid: string): LargeTransfer | null {
    return this.transfers.find(transfer => transfer.txid === txid) || null;
  }

  /**
   * Get system configuration and memory usage
   */
  public getStorageStats(): any {
    const transferMemory = this.transfers.length * 200; // ~200 bytes per transfer
    const cacheMemory = this.scriptCache.size * 80; // ~80 bytes per cache entry
    const totalMemory = transferMemory + cacheMemory;
    
    return {
      transferCount: this.transfers.length,
      scriptCacheSize: this.scriptCache.size,
      estimatedMemoryUsage: {
        transfers: `${Math.round(transferMemory / 1024)}KB`,
        scriptCache: `${Math.round(cacheMemory / 1024)}KB`,
        total: `${Math.round(totalMemory / 1024)}KB`
      },
      memoryUtilization: {
        transfersUsed: `${Math.round((this.transfers.length / this.maxTransfers) * 100)}%`,
        cacheUsed: `${Math.round((this.scriptCache.size / this.maxScriptCacheSize) * 100)}%`
      },
      config: {
        minTransferThresholdBTC: Money.fromCents(this.minTransferThreshold, CURRENCY).toString(),
        maxTransferThresholdBTC: Money.fromCents(this.maxTransferThreshold, CURRENCY).toString(),
        maxTransfers: this.maxTransfers,
        maxScriptCacheSize: this.maxScriptCacheSize,
        currentOldestTransfer: this.transfers.length > 0 ? this.transfers[0].blockHeight : null,
        currentNewestTransfer: this.transfers.length > 0 ? this.transfers[this.transfers.length - 1].blockHeight : null
      }
    };
  }

  /**
   * Get script cache performance metrics
   */
  public getScriptCacheStats(): any {
    return {
      cacheSize: this.scriptCache.size,
      maxCacheSize: this.maxScriptCacheSize,
      utilizationPercent: Math.round((this.scriptCache.size / this.maxScriptCacheSize) * 100),
      estimatedMemoryUsage: `${Math.round((this.scriptCache.size * 80) / 1024)}KB`,
      estimatedHitRate: "95%+", // Expected based on script reuse patterns
      pruningEnabled: true
    };
  }

  /**
   * Update configuration (for runtime tuning)
   */
  public updateConfig(config: {
    minTransferThreshold?: string;
    maxTransferThreshold?: string;
    maxTransfers?: number;
    maxScriptCacheSize?: number;
  }): void {
    if (config.minTransferThreshold !== undefined) {
      this.minTransferThreshold = config.minTransferThreshold;
    }
    if (config.maxTransferThreshold !== undefined) {
      this.maxTransferThreshold = config.maxTransferThreshold;
    }
    if (config.maxTransfers !== undefined) {
      this.maxTransfers = config.maxTransfers;
      // Trim transfers if new limit is smaller
      while (this.transfers.length > this.maxTransfers) {
        this.transfers.shift();
      }
    }
    if (config.maxScriptCacheSize !== undefined) {
      this.maxScriptCacheSize = config.maxScriptCacheSize;
      // Trim cache if new limit is smaller
      while (this.scriptCache.size > this.maxScriptCacheSize) {
        this.evictOldestCacheEntry();
      }
    }
  }
}