import { v4 as uuidv4 } from 'uuid';
import { Model } from '@easylayer/bitcoin-crawler';
import { ScriptUtilService, Block, NetworkConfig } from '@easylayer/bitcoin';
import { Money, Currency } from '@easylayer/common/arithmetic';
import {
  ClusterAnalysisEvent,
  AddressOutput,
  AddressInput,
  AddressConnection,
} from './events';
import P from './profiler';

export const CURRENCY: Currency = {
  code: 'BTC',
  minorUnit: 8,
};

/**
 * Detected connection between addresses with business logic validation
 * 
 * EXAMPLE:
 * {
 *   fromAddress: "1SenderAddr...",
 *   toAddress: "1ReceiverAddr...",
 *   txid: "abc123def...",
 *   blockHeight: 850000,
 *   amount: "500000000",          // 5 BTC
 *   connectionType: "LARGE",      // Based on amount thresholds
 *   confidence: 0.85,             // Business rule confidence
 *   metadata: {
 *     inputCount: 3,              // Number of inputs in transaction
 *     outputCount: 2,             // Number of outputs in transaction
 *     isRoundAmount: true,        // Amount ends with many zeros
 *     timeOfDay: 14,              // Hour of day (for pattern analysis)
 *     dayOfWeek: 3                // Day of week (for pattern analysis)
 *   }
 * }
 */
export interface ProcessedConnection {
  fromAddress: string;              // Source address
  toAddress: string;                // Destination address  
  txid: string;                     // Transaction ID
  blockHeight: number;              // Block height
  timestamp: number;                // Unix timestamp
  amount: string;                   // Amount in satoshi
  connectionType: string;           // DUST, SMALL, MEDIUM, LARGE, VERY_LARGE
  confidence: number;               // Connection confidence (0-1)
  metadata: {                       // Additional context for projections
    inputCount: number;             // Number of transaction inputs
    outputCount: number;            // Number of transaction outputs
    isRoundAmount: boolean;         // Whether amount is "round" (many trailing zeros)
    timeOfDay: number;              // Hour of day (0-23)
    dayOfWeek: number;              // Day of week (0-6)
    totalTxValue: string;           // Total transaction value
    addressPosition: 'SINGLE' | 'FIRST' | 'MIDDLE' | 'LAST'; // Position in output list
  };
}

/**
 * LRU cache entry for parsed scripts
 */
interface ScriptCacheEntry {
  address: string;
  lastUsed: number;
}

export const UNIQ_MODEL_NAME = 'address-connection-processor';

/**
 * AddressConnectionProcessorModel - Processes transactions and emits validated address connections
 * 
 * PURPOSE: Business logic layer that processes raw blockchain data and emits structured events
 * for read projections to consume. Does NOT store large amounts of data - just processes and emits.
 * 
 * MEMORY USAGE (MINIMAL):
 * - monitoredAddresses: ~50 bytes × maxAddresses = ~500KB for 10K addresses
 * - scriptCache: ~80 bytes × 5K = ~400KB (LRU bounded)
 * - recentConnections: ~200 bytes × 1K = ~200KB (sliding window for deduplication)
 * - Total: ~1.1MB (CONSTANT - no graphs or complex structures)
 * 
 * BUSINESS RULES APPLIED:
 * - Connection significance filtering (minimum amounts, timeframes)
 * - Pattern detection (round amounts, timing patterns, transaction structure)
 * - Confidence scoring based on transaction characteristics
 * - Deduplication of similar connections in short timeframes
 * - Metadata enrichment for downstream analysis
 * 
 * OUTPUT: Clean, validated AddressConnection events for read projections
 */
export default class AddressConnectionProcessorModel extends Model {
  // Configuration
  private maxMonitoredAddresses: number = 10000;        // Addresses to monitor for connections
  private maxScriptCacheSize: number = 5000;            // LRU script cache
  private recentConnectionsWindow: number = 144;        // Blocks to keep for deduplication (1 day)
  
  // Business rule thresholds  
  private readonly MIN_CONNECTION_AMOUNT = "1000000";   // 0.01 BTC minimum
  private readonly ROUND_AMOUNT_THRESHOLD = 6;          // 6+ trailing zeros = round
  private readonly MAX_OUTPUTS_FOR_PERSONAL = 5;        // Personal wallets usually < 5 outputs
  private readonly HIGH_VALUE_THRESHOLD = "1000000000"; // 10 BTC = high value
  
  // Cache cleanup frequency
  private readonly CACHE_CLEANUP_INTERVAL = 1000;
  
  /**
   * Set of addresses to monitor for connections
   * MEMORY: ~50 bytes × maxMonitoredAddresses = ~500KB
   * PURPOSE: Only process connections involving these addresses
   */
  private monitoredAddresses: Set<string> = new Set();
  
  /**
   * LRU cache for parsed scripts
   * MEMORY: ~80 bytes × maxScriptCacheSize = ~400KB  
   * PURPOSE: Avoid repeated expensive script parsing
   */
  private scriptCache: Map<string, ScriptCacheEntry> = new Map();
  
  /**
   * Recent connections for deduplication (sliding window)
   * MEMORY: ~200 bytes × estimated 1K connections = ~200KB
   * PURPOSE: Prevent duplicate connection events for same address pairs
   */
  private recentConnections: Map<string, ProcessedConnection> = new Map();

  constructor() {
    super(UNIQ_MODEL_NAME);
  }

  /**
   * Serialize model state for persistence
   */
  protected toJsonPayload(): any {
    return {
      maxMonitoredAddresses: this.maxMonitoredAddresses,
      maxScriptCacheSize: this.maxScriptCacheSize,
      recentConnectionsWindow: this.recentConnectionsWindow,
      monitoredAddresses: Array.from(this.monitoredAddresses),
      scriptCache: Array.from(this.scriptCache.entries()),
      recentConnections: Array.from(this.recentConnections.entries()),
    };
  }

  /**
   * Deserialize model state from persistence
   */
  protected fromSnapshot(state: any): void {
    if (state.maxMonitoredAddresses !== undefined) this.maxMonitoredAddresses = state.maxMonitoredAddresses;
    if (state.maxScriptCacheSize !== undefined) this.maxScriptCacheSize = state.maxScriptCacheSize;
    if (state.recentConnectionsWindow !== undefined) this.recentConnectionsWindow = state.recentConnectionsWindow;
    
    if (state.monitoredAddresses && Array.isArray(state.monitoredAddresses)) {
      this.monitoredAddresses = new Set(state.monitoredAddresses);
    }
    
    if (state.scriptCache && Array.isArray(state.scriptCache)) {
      this.scriptCache = new Map(state.scriptCache);
    }
    
    if (state.recentConnections && Array.isArray(state.recentConnections)) {
      this.recentConnections = new Map(state.recentConnections);
    }
    
    Object.setPrototypeOf(this, AddressConnectionProcessorModel.prototype);
  }

  /**
   * Add addresses to monitoring set
   */
  public addMonitoredAddresses(addresses: string[]): void {
    for (const address of addresses) {
      this.monitoredAddresses.add(address);
    }

    // Limit monitored addresses (FIFO)
    if (this.monitoredAddresses.size > this.maxMonitoredAddresses) {
      const addressArray = Array.from(this.monitoredAddresses);
      const excess = this.monitoredAddresses.size - this.maxMonitoredAddresses;
      for (let i = 0; i < excess; i++) {
        this.monitoredAddresses.delete(addressArray[i]);
      }
    }
  }

  /**
   * Parse block and extract address connections with business logic
   * CORE BUSINESS LOGIC: Process transactions and emit validated connection events
   */
  async parseBlock({ block, networkConfig }: { block: Block; networkConfig: NetworkConfig }) {
    const { tx, height, time } = block;

    const newOutputs: AddressOutput[] = [];
    const spentInputs: AddressInput[] = [];
    const validatedConnections: ProcessedConnection[] = [];

    let vinTime = 0n;
    let voutTime = 0n;
    let scriptTime = 0n;
    let businessLogicTime = 0n;
    let applyTime = 0n;

    for (const transaction of tx) {
      const { txid, vin, vout } = transaction;
      
      const tBusiness0 = P.now();
      
      // Collect transaction data for business logic analysis
      const inputAddresses: string[] = [];
      const outputData: { address: string; value: string; index: number }[] = [];
      let totalTxValue = BigInt(0);

      const tVin0 = P.now();
      for (const input of vin) {
        if (input.coinbase) continue;
        if (input.txid && input.vout !== undefined) {
          spentInputs.push({ txid: input.txid, n: input.vout });
          // Note: Will resolve input addresses in event handler if needed
        }
      }
      vinTime += P.now() - tVin0;

      const tVout0 = P.now();
      for (let i = 0; i < vout.length; i++) {
        const output = vout[i];
        const tScript0 = P.now();
        const address = this.extractAddressFromVout(output, networkConfig, height);
        scriptTime += P.now() - tScript0;

        if (!address) continue;

        const value = Money.fromDecimal(output.value.toString(), CURRENCY).toCents();
        const valueBig = BigInt(value);
        totalTxValue += valueBig;
        
        newOutputs.push({ address, txid, n: output.n, value });
        outputData.push({ address, value, index: i });
      }
      voutTime += P.now() - tVout0;

      // BUSINESS LOGIC: Analyze transaction for meaningful connections
      if (outputData.length >= 2) { // Need at least 2 outputs for connections
        const connections = this.analyzeTransactionConnections(
          txid, height, time || 0, inputAddresses, outputData, totalTxValue.toString()
        );
        validatedConnections.push(...connections);
      }
      
      businessLogicTime += P.now() - tBusiness0;
    }

    // Clean up old connections and cache periodically
    if (height % this.CACHE_CLEANUP_INTERVAL === 0) {
      this.cleanupRecentConnections(height);
      this.cleanupScriptCache(height);
    }

    // Emit event with processed data
    if (newOutputs.length > 0 || spentInputs.length > 0 || validatedConnections.length > 0) {
      const tA0 = P.now();
      
      // Convert ProcessedConnections to AddressConnections for event
      const addressConnections: AddressConnection[] = validatedConnections.map(conn => ({
        fromAddress: conn.fromAddress,
        toAddress: conn.toAddress,
        txid: conn.txid,
        blockHeight: conn.blockHeight,
        amount: conn.amount,
        connectionType: conn.connectionType
      }));

      await this.apply(
        new ClusterAnalysisEvent({
          aggregateId: this.aggregateId,
          requestId: uuidv4(),
          blockHeight: height,
          outputs: newOutputs,
          inputs: spentInputs,
          connections: addressConnections,
        }),
      );
      applyTime = P.now() - tA0;
    }

    P.mark(`h${height}`);
    P.add(vinTime, voutTime, scriptTime, businessLogicTime, applyTime);
  }

  /**
   * CORE BUSINESS LOGIC: Analyze transaction for meaningful address connections
   * Applies business rules to determine which connections are significant
   */
  private analyzeTransactionConnections(
    txid: string,
    blockHeight: number,
    timestamp: number,
    inputAddresses: string[],
    outputs: { address: string; value: string; index: number }[],
    totalTxValue: string
  ): ProcessedConnection[] {
    const connections: ProcessedConnection[] = [];
    
    // Only process if we have monitored addresses involved
    const monitoredOutputs = outputs.filter(o => this.monitoredAddresses.has(o.address));
    if (monitoredOutputs.length === 0) return connections;

    // Calculate time-based metadata
    const date = new Date(timestamp * 1000);
    const timeOfDay = date.getHours();
    const dayOfWeek = date.getDay();

    // Analyze connections between monitored outputs
    for (let i = 0; i < monitoredOutputs.length; i++) {
      for (let j = i + 1; j < monitoredOutputs.length; j++) {
        const output1 = monitoredOutputs[i];
        const output2 = monitoredOutputs[j];
        
        // Skip if addresses are the same
        if (output1.address === output2.address) continue;
        
        // Apply business rules to determine if this is a significant connection
        const connectionAnalysis = this.evaluateConnection(
          output1, output2, outputs, totalTxValue, //timeOfDay, dayOfWeek
        );
        
        if (connectionAnalysis.isSignificant) {
          // Create connection (bidirectional analysis)
          const connection: ProcessedConnection = {
            fromAddress: output1.address,
            toAddress: output2.address,
            txid,
            blockHeight,
            timestamp,
            amount: connectionAnalysis.relevantAmount,
            connectionType: connectionAnalysis.connectionType,
            confidence: connectionAnalysis.confidence,
            metadata: {
              inputCount: inputAddresses.length,
              outputCount: outputs.length,
              isRoundAmount: this.isRoundAmount(connectionAnalysis.relevantAmount),
              timeOfDay,
              dayOfWeek,
              totalTxValue,
              addressPosition: this.getAddressPosition(output1.index, outputs.length)
            }
          };

          // Check for recent duplicates
          if (!this.isDuplicateConnection(connection)) {
            connections.push(connection);
            this.addRecentConnection(connection);
          }
        }
      }
    }

    return connections;
  }

  /**
   * BUSINESS RULE: Evaluate whether a connection between addresses is significant
   */
  private evaluateConnection(
    output1: { address: string; value: string; index: number },
    output2: { address: string; value: string; index: number },
    allOutputs: { address: string; value: string; index: number }[],
    totalTxValue: string
  ): {
    isSignificant: boolean;
    relevantAmount: string;
    connectionType: string;
    confidence: number;
  } {
    // Use the larger of the two amounts as the connection strength
    const amount1 = BigInt(output1.value);
    const amount2 = BigInt(output2.value);
    const relevantAmount = amount1 > amount2 ? output1.value : output2.value;
    const relevantAmountBig = BigInt(relevantAmount);
    
    // BUSINESS RULE 1: Minimum amount threshold
    if (relevantAmountBig < BigInt(this.MIN_CONNECTION_AMOUNT)) {
      return { isSignificant: false, relevantAmount, connectionType: "DUST", confidence: 0 };
    }

    // BUSINESS RULE 2: Classify connection type by amount
    const connectionType = this.classifyConnectionByAmount(relevantAmount);
    
    // BUSINESS RULE 3: Calculate confidence based on transaction characteristics
    let confidence = 0.5; // Base confidence
    
    // Higher confidence for larger amounts
    if (relevantAmountBig >= BigInt(this.HIGH_VALUE_THRESHOLD)) {
      confidence += 0.3;
    }
    
    // Higher confidence for fewer outputs (more direct relationship)
    if (allOutputs.length <= this.MAX_OUTPUTS_FOR_PERSONAL) {
      confidence += 0.2;
    }
    
    // Higher confidence for round amounts (suggests manual/planned transfers)
    if (this.isRoundAmount(relevantAmount)) {
      confidence += 0.1;
    }
    
    // Lower confidence for many outputs (spray transactions)
    if (allOutputs.length > 10) {
      confidence -= 0.2;
    }
    
    confidence = Math.max(0.1, Math.min(1.0, confidence));

    return {
      isSignificant: true,
      relevantAmount,
      connectionType,
      confidence
    };
  }

  /**
   * BUSINESS RULE: Classify connection type based on amount
   */
  private classifyConnectionByAmount(amount: string): string {
    const amountBTC = Number(BigInt(amount) / BigInt(100000000));
    
    if (amountBTC >= 100) return "VERY_LARGE";
    if (amountBTC >= 10) return "LARGE";
    if (amountBTC >= 1) return "MEDIUM";
    if (amountBTC >= 0.1) return "SMALL";
    return "DUST";
  }

  /**
   * BUSINESS RULE: Check if amount is "round" (many trailing zeros)
   */
  private isRoundAmount(amount: string): boolean {
    const amountStr = amount;
    let trailingZeros = 0;
    for (let i = amountStr.length - 1; i >= 0; i--) {
      if (amountStr[i] === '0') {
        trailingZeros++;
      } else {
        break;
      }
    }
    return trailingZeros >= this.ROUND_AMOUNT_THRESHOLD;
  }

  /**
   * Get address position in output list for pattern analysis
   */
  private getAddressPosition(index: number, totalOutputs: number): 'SINGLE' | 'FIRST' | 'MIDDLE' | 'LAST' {
    if (totalOutputs === 1) return 'SINGLE';
    if (index === 0) return 'FIRST';
    if (index === totalOutputs - 1) return 'LAST';
    return 'MIDDLE';
  }

  /**
   * Check if connection is duplicate of recent connection
   */
  private isDuplicateConnection(connection: ProcessedConnection): boolean {
    const key1 = `${connection.fromAddress}_${connection.toAddress}`;
    const key2 = `${connection.toAddress}_${connection.fromAddress}`;
    
    return this.recentConnections.has(key1) || this.recentConnections.has(key2);
  }

  /**
   * Add connection to recent connections for deduplication
   */
  private addRecentConnection(connection: ProcessedConnection): void {
    const key = `${connection.fromAddress}_${connection.toAddress}`;
    this.recentConnections.set(key, connection);
  }

  /**
   * Clean up old recent connections outside the window
   */
  private cleanupRecentConnections(currentBlock: number): void {
    const cutoffBlock = currentBlock - this.recentConnectionsWindow;
    
    for (const [key, connection] of this.recentConnections) {
      if (connection.blockHeight < cutoffBlock) {
        this.recentConnections.delete(key);
      }
    }
  }

  /**
   * Extract Bitcoin address from vout with LRU caching
   */
  private extractAddressFromVout(vout: any, networkConfig: any, blockHeight: number): string | undefined {
    try {
      // Step 1: Direct address (fastest)
      if (vout.scriptPubKey?.addresses?.[0]) {
        return vout.scriptPubKey.addresses[0];
      }

      // Step 2: Script cache lookup
      if (vout.scriptPubKey?.hex) {
        const scriptHex = vout.scriptPubKey.hex;
        const cached = this.scriptCache.get(scriptHex);
        if (cached) {
          cached.lastUsed = blockHeight;
          return cached.address;
        }

        // Step 3: Parse and cache
        const scriptHash = ScriptUtilService.getScriptHashFromScriptPubKey(
          vout.scriptPubKey, 
          networkConfig.network
        );
        
        if (scriptHash) {
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
   * Add to script cache with LRU management
   */
  private addToScriptCache(scriptHex: string, address: string, blockHeight: number): void {
    this.scriptCache.set(scriptHex, { address, lastUsed: blockHeight });

    if (this.scriptCache.size > this.maxScriptCacheSize) {
      this.evictOldestCacheEntry();
    }
  }

  /**
   * Evict oldest script cache entry
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
   * Clean up old script cache entries
   */
  private cleanupScriptCache(currentBlock: number): void {
    const cacheAgeThreshold = 10000;
    const cutoffBlock = currentBlock - cacheAgeThreshold;
    
    for (const [key, entry] of this.scriptCache) {
      if (entry.lastUsed < cutoffBlock) {
        this.scriptCache.delete(key);
      }
    }
  }

  /**
   * Event handler - just emit the events, no complex storage
   */
  private onClusterAnalysisEvent({ payload }: ClusterAnalysisEvent) {
    // This model doesn't store complex state - it just processes and emits
    // All the complex clustering logic will be in read projections
  }

  // =============================================================================
  // PUBLIC QUERY METHODS (Minimal - main data is in read projections)
  // =============================================================================

  /**
   * Get monitored addresses
   */
  public getMonitoredAddresses(): string[] {
    return Array.from(this.monitoredAddresses);
  }

  /**
   * Get recent connections (for debugging/monitoring)
   */
  public getRecentConnections(): ProcessedConnection[] {
    return Array.from(this.recentConnections.values())
      .sort((a, b) => b.blockHeight - a.blockHeight);
  }

  /**
   * Get processing statistics
   */
  public getProcessingStats(): any {
    return {
      monitoredAddresses: this.monitoredAddresses.size,
      recentConnections: this.recentConnections.size,
      scriptCacheSize: this.scriptCache.size,
      memoryUsage: {
        addresses: `${Math.round(this.monitoredAddresses.size * 50 / 1024)}KB`,
        connections: `${Math.round(this.recentConnections.size * 200 / 1024)}KB`,
        scriptCache: `${Math.round(this.scriptCache.size * 80 / 1024)}KB`,
        total: `${Math.round((this.monitoredAddresses.size * 50 + this.recentConnections.size * 200 + this.scriptCache.size * 80) / 1024)}KB`
      },
      config: {
        maxMonitoredAddresses: this.maxMonitoredAddresses,
        recentConnectionsWindow: this.recentConnectionsWindow,
        minConnectionAmount: this.MIN_CONNECTION_AMOUNT,
        businessRules: {
          minConnectionAmountBTC: Number(BigInt(this.MIN_CONNECTION_AMOUNT) / BigInt(100000000)),
          roundAmountThreshold: this.ROUND_AMOUNT_THRESHOLD,
          maxOutputsForPersonal: this.MAX_OUTPUTS_FOR_PERSONAL,
          highValueThresholdBTC: Number(BigInt(this.HIGH_VALUE_THRESHOLD) / BigInt(100000000))
        }
      }
    };
  }
}