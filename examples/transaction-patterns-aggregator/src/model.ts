import { v4 as uuidv4 } from 'uuid';
import { Model } from '@easylayer/bitcoin-crawler';
import { ScriptUtilService, Block, NetworkConfig } from '@easylayer/bitcoin';
import { Money, Currency } from '@easylayer/common/arithmetic';
import {
  PatternAnalysisEvent,
  AddressOutput,
  AddressInput,
  TransactionPattern,
} from './events';
import P from './profiler';

export const CURRENCY: Currency = {
  code: 'BTC',
  minorUnit: 8,
};

/**
 * Timing profile for an address - detects regular intervals
 * 
 * EXAMPLE:
 * {
 *   address: "1BotAddress...",
 *   intervals: [3600, 7200, 3600, 3480, 3720], // Seconds between transactions
 *   averageInterval: 3760,                      // Average time between transactions
 *   intervalVariance: 0.15,                     // Low variance = regular pattern
 *   regularityScore: 0.85,                      // High score = likely bot
 *   lastActivity: 850000,                       // Block height of last transaction
 *   transactionCount: 156                       // Total transactions analyzed
 * }
 */
export interface TimingProfile {
  address: string;                  // Bitcoin address
  intervals: number[];              // Time intervals between transactions (seconds)
  averageInterval: number;          // Average interval in seconds
  intervalVariance: number;         // Variance in intervals (0=perfect regularity, 1=random)
  regularityScore: number;          // Computed regularity score (0-1, higher=more regular)
  lastActivity: number;             // Block height of most recent transaction
  transactionCount: number;         // Number of transactions in this profile
}

/**
 * Amount signature for an address - detects round numbers and patterns
 * 
 * EXAMPLE:
 * {
 *   address: "1Exchange...",
 *   amounts: ["100000000", "50000000", "100000000", "25000000"], // Recent amounts
 *   roundAmountRatio: 0.75,                      // 75% are round numbers
 *   uniqueAmountRatio: 0.5,                      // 50% are unique (low = repetitive)
 *   averageAmount: "68750000",                   // Average transaction amount
 *   amountVariance: 0.4,                         // Variance in amounts
 *   suspiciousPatterns: ["ROUND_NUMBERS", "FIXED_AMOUNTS"] // Detected patterns
 * }
 */
export interface AmountSignature {
  address: string;                  // Bitcoin address
  amounts: string[];                // Recent transaction amounts (as strings)
  roundAmountRatio: number;         // Ratio of round number amounts (0-1)
  uniqueAmountRatio: number;        // Ratio of unique amounts (0-1)
  averageAmount: string;            // Average transaction amount
  amountVariance: number;           // Variance in transaction amounts
  suspiciousPatterns: string[];     // Array of detected suspicious patterns
}

/**
 * Mixing profile for an address - detects privacy/mixing behavior
 * 
 * EXAMPLE:
 * {
 *   address: "1Mixer...",
 *   avgInputCount: 8.5,                         // Average inputs per transaction
 *   avgOutputCount: 12.2,                       // Average outputs per transaction
 *   inputOutputRatio: 0.7,                      // Ratio of inputs to outputs
 *   changePatternScore: 0.3,                    // How often change outputs are used
 *   mixingScore: 0.85,                          // Overall mixing behavior score
 *   coinjoinParticipation: 15,                  // Number of likely CoinJoin transactions
 *   privacyRating: "HIGH"                       // Privacy behavior classification
 * }
 */
export interface MixingProfile {
  address: string;                  // Bitcoin address
  avgInputCount: number;            // Average number of inputs per transaction
  avgOutputCount: number;           // Average number of outputs per transaction
  inputOutputRatio: number;         // Ratio of inputs to outputs
  changePatternScore: number;       // Score for change pattern detection
  mixingScore: number;              // Overall mixing behavior score (0-1)
  coinjoinParticipation: number;    // Estimated CoinJoin participation count
  privacyRating: string;            // Privacy behavior classification
}

/**
 * Combined suspicion score entry for sorted ranking
 */
interface SuspicionEntry {
  address: string;                  // Bitcoin address
  overallScore: number;             // Combined suspicion score (0-1)
  category: string;                 // Primary suspicious category
}

/**
 * Rolling time window for transaction analysis
 */
interface TimeWindow {
  startTime: number;                // Unix timestamp of window start
  endTime: number;                  // Unix timestamp of window end
  transactionCount: number;         // Number of transactions in this window
}

export const UNIQ_MODEL_NAME = 'transaction-pattern';

/**
 * TransactionPatternModel - Efficiently detects suspicious transaction patterns
 * 
 * Memory usage (for 10,000 tracked addresses):
 * - timingProfiles: ~200 bytes × 10K = ~2MB
 * - amountSignatures: ~300 bytes × 10K = ~3MB  
 * - mixingProfiles: ~150 bytes × 10K = ~1.5MB
 * - suspicionScores: ~80 bytes × 10K = ~800KB
 * - addressTransactions: ~100 bytes × 50K = ~5MB (rolling window)
 * - blockTimestamps: ~12 bytes × 2016 = ~24KB (2 weeks)
 * - Total: ~12.3MB
 * 
 * Key optimizations:
 * - Rolling windows for transaction history to limit memory growth
 * - Sorted suspicion scores for O(1) top suspicious address access
 * - Incremental pattern scoring to avoid full recalculation
 * - Efficient variance calculations using running statistics
 */
export default class TransactionPatternModel extends Model {
  // Configuration
  private maxTrackedAddresses: number = 10000;
  
  // Analysis window settings
  private readonly TIMING_WINDOW_SIZE = 50;           // Keep last 50 transactions for timing analysis
  private readonly AMOUNT_WINDOW_SIZE = 100;          // Keep last 100 transactions for amount analysis
  private readonly MIXING_WINDOW_SIZE = 30;           // Keep last 30 transactions for mixing analysis
  private readonly BLOCK_TIMESTAMP_WINDOW = 2016;     // Keep 2 weeks of block timestamps
  
  // Suspicion thresholds
  private readonly MIN_TRANSACTIONS_FOR_ANALYSIS = 10; // Minimum transactions before analysis
  private readonly HIGH_REGULARITY_THRESHOLD = 0.8;   // Threshold for high regularity score
  private readonly HIGH_MIXING_THRESHOLD = 0.7;       // Threshold for high mixing score
  
  /**
   * Timing profiles for addresses showing regular transaction patterns
   * 
   * Key: Bitcoin address
   * Value: TimingProfile with interval analysis
   * 
   * Memory: ~200 bytes per address × maxTrackedAddresses = ~2MB for 10K addresses
   * Used to detect bot behavior, automated systems, regular payments
   */
  private timingProfiles: Map<string, TimingProfile> = new Map();
  
  /**
   * Amount signatures for addresses showing suspicious amount patterns
   * 
   * Key: Bitcoin address  
   * Value: AmountSignature with round number detection, repetitive amounts
   * 
   * Memory: ~300 bytes per address × maxTrackedAddresses = ~3MB for 10K addresses
   * Used to detect money laundering, structuring, automated systems
   */
  private amountSignatures: Map<string, AmountSignature> = new Map();
  
  /**
   * Mixing profiles for addresses showing privacy/mixing behavior
   * 
   * Key: Bitcoin address
   * Value: MixingProfile with input/output analysis
   * 
   * Memory: ~150 bytes per address × maxTrackedAddresses = ~1.5MB for 10K addresses
   * Used to detect CoinJoin participation, mixing services, privacy tools
   */
  private mixingProfiles: Map<string, MixingProfile> = new Map();
  
  /**
   * Sorted suspicion scores for fast access to most suspicious addresses
   * 
   * Always maintained in descending order by overall suspicion score
   * Combines timing, amount, and mixing scores into single ranking
   * 
   * Memory: ~80 bytes per entry × maxTrackedAddresses = ~800KB for 10K addresses
   * Operations: O(1) access to top suspicious, O(log N) score updates
   */
  private suspicionScores: SuspicionEntry[] = [];
  
  /**
   * Rolling window of transaction data for each address
   * 
   * Key: Bitcoin address
   * Value: Array of recent TransactionPattern objects
   * 
   * Memory: ~100 bytes per transaction × estimated 50K active transactions = ~5MB
   * Windows are automatically trimmed to prevent unbounded growth
   */
  private addressTransactions: Map<string, TransactionPattern[]> = new Map();
  
  /**
   * Block timestamps for time-based analysis
   * 
   * Key: Block height
   * Value: Unix timestamp
   * 
   * Memory: ~12 bytes per block × BLOCK_TIMESTAMP_WINDOW = ~24KB for 2 weeks
   * Used to convert block heights to timestamps for interval calculations
   */
  private blockTimestamps: Map<number, number> = new Map();

  constructor() {
    super(UNIQ_MODEL_NAME);
  }

  /**
   * Serialize model state for persistence
   * Required by the framework for snapshots and recovery
   */
  protected toJsonPayload(): any {
    return {
      maxTrackedAddresses: this.maxTrackedAddresses,
      timingProfiles: Array.from(this.timingProfiles.entries()),
      amountSignatures: Array.from(this.amountSignatures.entries()),
      mixingProfiles: Array.from(this.mixingProfiles.entries()),
      suspicionScores: this.suspicionScores,
      addressTransactions: Array.from(this.addressTransactions.entries()),
      blockTimestamps: Array.from(this.blockTimestamps.entries()),
    };
  }

  /**
   * Deserialize model state from persistence
   * Required by the framework for loading from snapshots
   */
  protected fromSnapshot(state: any): void {
    // Restore configuration
    if (state.maxTrackedAddresses !== undefined) this.maxTrackedAddresses = state.maxTrackedAddresses;
    
    // Restore timing profiles
    if (state.timingProfiles && Array.isArray(state.timingProfiles)) {
      this.timingProfiles = new Map(state.timingProfiles);
    }
    
    // Restore amount signatures
    if (state.amountSignatures && Array.isArray(state.amountSignatures)) {
      this.amountSignatures = new Map(state.amountSignatures);
    }
    
    // Restore mixing profiles
    if (state.mixingProfiles && Array.isArray(state.mixingProfiles)) {
      this.mixingProfiles = new Map(state.mixingProfiles);
    }
    
    // Restore suspicion scores
    if (state.suspicionScores && Array.isArray(state.suspicionScores)) {
      this.suspicionScores = state.suspicionScores;
    } else {
      // Rebuild suspicion scores if missing
      this.rebuildSuspicionScores();
    }
    
    // Restore transaction windows
    if (state.addressTransactions && Array.isArray(state.addressTransactions)) {
      this.addressTransactions = new Map(state.addressTransactions);
    }
    
    // Restore block timestamps
    if (state.blockTimestamps && Array.isArray(state.blockTimestamps)) {
      this.blockTimestamps = new Map(state.blockTimestamps);
    }
    
    // Restore prototype (required by framework)
    Object.setPrototypeOf(this, TransactionPatternModel.prototype);
  }

  /**
   * Rebuild suspicion scores from existing profiles
   * Called when loading old snapshots without scores
   */
  private rebuildSuspicionScores(): void {
    this.suspicionScores = [];
    
    // Get all addresses with any profile
    const allAddresses = new Set<string>();
    this.timingProfiles.forEach((_, addr) => allAddresses.add(addr));
    this.amountSignatures.forEach((_, addr) => allAddresses.add(addr));
    this.mixingProfiles.forEach((_, addr) => allAddresses.add(addr));
    
    // Calculate scores for each address
    for (const address of allAddresses) {
      const score = this.calculateOverallSuspicionScore(address);
      if (score > 0) {
        this.suspicionScores.push({
          address,
          overallScore: score,
          category: this.getPrimarySuspiciousCategory(address)
        });
      }
    }
    
    // Sort by score descending
    this.suspicionScores.sort((a, b) => b.overallScore - a.overallScore);
  }

  async parseBlock({ block, networkConfig }: { block: Block; networkConfig: NetworkConfig }) {
    const { tx, height, time } = block;

    // Store block timestamp for time-based analysis
    if (time) {
      this.blockTimestamps.set(height, time);
      this.limitBlockTimestamps();
    }

    const newOutputs: AddressOutput[] = [];
    const spentInputs: AddressInput[] = [];
    const detectedPatterns: TransactionPattern[] = [];

    let vinTime = 0n;
    let voutTime = 0n;
    let scriptTime = 0n;
    let patternTime = 0n;
    let applyTime = 0n;

    for (const transaction of tx) {
      const { txid, vin, vout } = transaction;
      
      const tPattern0 = P.now();
      
      // Analyze transaction pattern
      const inputCount = vin.filter(input => !input.coinbase).length;
      const outputCount = vout.length;
      
      // Extract unique addresses involved in transaction
      const inputAddresses = new Set<string>();
      const outputAddresses = new Set<string>();
      const amounts: string[] = [];

      const tVin0 = P.now();
      for (const input of vin) {
        if (input.coinbase) continue;
        if (input.txid && input.vout !== undefined) {
          spentInputs.push({ txid: input.txid, n: input.vout });
          // Note: We don't have input address here, will be resolved in event handler
        }
      }
      vinTime += P.now() - tVin0;

      const tVout0 = P.now();
      for (const output of vout) {
        const tScript0 = P.now();
        const address = this.extractAddressFromVout(output, networkConfig);
        scriptTime += P.now() - tScript0;

        if (!address) continue;

        const value = Money.fromDecimal(output.value.toString(), CURRENCY).toCents();
        amounts.push(value);
        outputAddresses.add(address);
        
        newOutputs.push({ address, txid, n: output.n, value });
      }
      voutTime += P.now() - tVout0;

      // Create transaction patterns for each output address
      for (const address of outputAddresses) {
        const pattern: TransactionPattern = {
          address,
          txid,
          blockHeight: height,
          timestamp: time || 0,
          inputCount,
          outputCount,
          amounts: amounts.filter(amount => {
            // Find outputs for this specific address
            for (const output of vout) {
              const outputAddr = this.extractAddressFromVout(output, networkConfig);
              if (outputAddr === address) {
                const outputValue = Money.fromDecimal(output.value.toString(), CURRENCY).toCents();
                return outputValue === amount;
              }
            }
            return false;
          }),
          isChange: this.detectChangeOutput(vout, address),
          isCoinJoin: this.detectCoinJoinTransaction(inputCount, outputCount, amounts)
        };
        
        detectedPatterns.push(pattern);
      }
      
      patternTime += P.now() - tPattern0;
    }

    if (newOutputs.length > 0 || spentInputs.length > 0 || detectedPatterns.length > 0) {
      const tA0 = P.now();
      await this.apply(
        new PatternAnalysisEvent({
          aggregateId: this.aggregateId,
          requestId: uuidv4(),
          blockHeight: height,
          outputs: newOutputs,
          inputs: spentInputs,
          patterns: detectedPatterns,
        }),
      );
      applyTime = P.now() - tA0;
    }

    P.mark(`h${height}`);
    P.add(vinTime, voutTime, scriptTime, applyTime);
  }

  /**
   * Extract Bitcoin address from transaction output
   * Handles multiple script types and formats
   */
  private extractAddressFromVout(vout: any, networkConfig: any): string | undefined {
    try {
      // Method 1: Direct address from scriptPubKey
      if (vout.scriptPubKey?.addresses && vout.scriptPubKey.addresses.length > 0) {
        return vout.scriptPubKey.addresses[0];
      }

      // Method 2: Derive address from script using utility service
      const scriptHash = ScriptUtilService.getScriptHashFromScriptPubKey(
        vout.scriptPubKey, 
        networkConfig.network
      );
      return scriptHash;
    } catch (error) {
      // Ignore unsupported script types (e.g., OP_RETURN, complex multisig)
      return undefined;
    }
  }

  /**
   * Detect if output is likely a change output
   * Uses heuristics like amount patterns and position
   */
  private detectChangeOutput(vout: any[], address: string): boolean {
    if (vout.length < 2) return false;
    
    // Find this address's output
    let targetOutput = null;
    for (const output of vout) {
      const outputAddr = this.extractAddressFromVout(output, vout);
      if (outputAddr === address) {
        targetOutput = output;
        break;
      }
    }
    
    if (!targetOutput) return false;
    
    // Heuristic: Last output is often change
    const isLastOutput = targetOutput.n === vout.length - 1;
    
    // Heuristic: Change outputs often have "random" amounts (not round numbers)
    const value = BigInt(Money.fromDecimal(targetOutput.value.toString(), CURRENCY).toCents());
    const isRoundAmount = this.isRoundAmount(value);
    
    return isLastOutput && !isRoundAmount;
  }

  /**
   * Detect if transaction is likely a CoinJoin
   * Uses input/output count patterns and amount analysis
   */
  private detectCoinJoinTransaction(inputCount: number, outputCount: number, amounts: string[]): boolean {
    // Basic CoinJoin heuristics
    if (inputCount < 3 || outputCount < 3) return false;
    
    // Check for multiple equal amounts (common in CoinJoin)
    const amountCounts = new Map<string, number>();
    for (const amount of amounts) {
      amountCounts.set(amount, (amountCounts.get(amount) || 0) + 1);
    }
    
    // If we have multiple outputs with the same amount, likely CoinJoin
    for (const count of amountCounts.values()) {
      if (count >= 3) return true;
    }
    
    return false;
  }

  /**
   * Check if amount is a "round number" (ends in many zeros)
   */
  private isRoundAmount(value: bigint): boolean {
    const valueStr = value.toString();
    
    // Count trailing zeros
    let trailingZeros = 0;
    for (let i = valueStr.length - 1; i >= 0; i--) {
      if (valueStr[i] === '0') {
        trailingZeros++;
      } else {
        break;
      }
    }
    
    // Consider "round" if has 6+ trailing zeros (>= 0.01 BTC precision)
    return trailingZeros >= 6;
  }

  /**
   * Limit block timestamps to prevent unbounded growth
   */
  private limitBlockTimestamps(): void {
    if (this.blockTimestamps.size > this.BLOCK_TIMESTAMP_WINDOW) {
      // Remove oldest timestamps
      const sortedHeights = Array.from(this.blockTimestamps.keys()).sort((a, b) => a - b);
      const toRemove = sortedHeights.slice(0, sortedHeights.length - this.BLOCK_TIMESTAMP_WINDOW);
      
      for (const height of toRemove) {
        this.blockTimestamps.delete(height);
      }
    }
  }

  /**
   * Event handler for pattern analysis
   * Updates profiles and maintains sorted suspicious rankings
   * 
   * Performance: O(patterns + log(maxTrackedAddresses))
   */
  private onPatternAnalysisEvent({ payload }: PatternAnalysisEvent) {
    const { patterns, blockHeight } = payload;

    const affectedAddresses = new Set<string>();

    // Step 1: Process detected patterns
    for (const pattern of patterns) {
      this.addTransactionPattern(pattern);
      affectedAddresses.add(pattern.address);
    }

    // Step 2: Update profiles for affected addresses
    for (const address of affectedAddresses) {
      this.updateAddressProfiles(address, blockHeight);
    }

    // Step 3: Update suspicion scores for affected addresses
    for (const address of affectedAddresses) {
      this.updateSuspicionScore(address);
    }

    // Step 4: Maintain top suspicious address limits
    this.limitTrackedAddresses();
  }

  /**
   * Add transaction pattern to address window
   */
  private addTransactionPattern(pattern: TransactionPattern): void {
    const patterns = this.addressTransactions.get(pattern.address) || [];
    patterns.push(pattern);
    
    // Trim window to maximum size
    if (patterns.length > this.AMOUNT_WINDOW_SIZE) {
      patterns.splice(0, patterns.length - this.AMOUNT_WINDOW_SIZE);
    }
    
    this.addressTransactions.set(pattern.address, patterns);
  }

  /**
   * Update all profiles for an address based on recent patterns
   */
  private updateAddressProfiles(address: string, blockHeight: number): void {
    const patterns = this.addressTransactions.get(address);
    if (!patterns || patterns.length < this.MIN_TRANSACTIONS_FOR_ANALYSIS) {
      return;
    }

    // Update timing profile
    this.updateTimingProfile(address, patterns, blockHeight);
    
    // Update amount signature
    this.updateAmountSignature(address, patterns);
    
    // Update mixing profile
    this.updateMixingProfile(address, patterns);
  }

  /**
   * Update timing profile for address
   * Analyzes intervals between transactions to detect regular patterns
   */
  private updateTimingProfile(address: string, patterns: TransactionPattern[], blockHeight: number): void {
    const timingPatterns = patterns
      .filter(p => p.timestamp > 0)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-this.TIMING_WINDOW_SIZE);

    if (timingPatterns.length < 3) return;

    // Calculate intervals between transactions
    const intervals: number[] = [];
    for (let i = 1; i < timingPatterns.length; i++) {
      const interval = timingPatterns[i].timestamp - timingPatterns[i-1].timestamp;
      if (interval > 0) intervals.push(interval);
    }

    if (intervals.length < 2) return;

    // Calculate statistics
    const averageInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    const variance = this.calculateVariance(intervals, averageInterval);
    const intervalVariance = variance / (averageInterval * averageInterval); // Coefficient of variation
    
    // Calculate regularity score (lower variance = higher regularity)
    const regularityScore = Math.max(0, 1 - intervalVariance);

    this.timingProfiles.set(address, {
      address,
      intervals: intervals.slice(-20), // Keep last 20 intervals
      averageInterval,
      intervalVariance,
      regularityScore,
      lastActivity: blockHeight,
      transactionCount: timingPatterns.length
    });
  }

  /**
   * Update amount signature for address
   * Analyzes transaction amounts to detect suspicious patterns
   */
  private updateAmountSignature(address: string, patterns: TransactionPattern[]): void {
    const amountPatterns = patterns.slice(-this.AMOUNT_WINDOW_SIZE);
    
    // Collect all amounts
    const allAmounts: string[] = [];
    for (const pattern of amountPatterns) {
      allAmounts.push(...pattern.amounts);
    }

    if (allAmounts.length < 5) return;

    // Analyze amount patterns
    const uniqueAmounts = new Set(allAmounts);
    const uniqueAmountRatio = uniqueAmounts.size / allAmounts.length;
    
    // Count round amounts
    let roundAmountCount = 0;
    for (const amount of allAmounts) {
      if (this.isRoundAmount(BigInt(amount))) {
        roundAmountCount++;
      }
    }
    const roundAmountRatio = roundAmountCount / allAmounts.length;

    // Calculate average and variance
    const amounts = allAmounts.map(a => Number(BigInt(a) / BigInt(100000000))); // Convert to BTC for calculation
    const averageAmount = amounts.reduce((sum, val) => sum + val, 0) / amounts.length;
    const amountVariance = this.calculateVariance(amounts, averageAmount) / (averageAmount * averageAmount);

    // Detect suspicious patterns
    const suspiciousPatterns: string[] = [];
    if (roundAmountRatio > 0.7) suspiciousPatterns.push("ROUND_NUMBERS");
    if (uniqueAmountRatio < 0.3) suspiciousPatterns.push("FIXED_AMOUNTS");
    if (amountVariance < 0.1) suspiciousPatterns.push("LOW_VARIANCE");

    this.amountSignatures.set(address, {
      address,
      amounts: allAmounts.slice(-50), // Keep last 50 amounts
      roundAmountRatio,
      uniqueAmountRatio,
      averageAmount: (BigInt(Math.round(averageAmount * 100000000))).toString(),
      amountVariance,
      suspiciousPatterns
    });
  }

  /**
   * Update mixing profile for address
   * Analyzes input/output patterns to detect privacy behavior
   */
  private updateMixingProfile(address: string, patterns: TransactionPattern[]): void {
    const mixingPatterns = patterns.slice(-this.MIXING_WINDOW_SIZE);

    if (mixingPatterns.length < 5) return;

    // Calculate averages
    const inputCounts = mixingPatterns.map(p => p.inputCount);
    const outputCounts = mixingPatterns.map(p => p.outputCount);
    const avgInputCount = inputCounts.reduce((sum, val) => sum + val, 0) / inputCounts.length;
    const avgOutputCount = outputCounts.reduce((sum, val) => sum + val, 0) / outputCounts.length;
    
    const inputOutputRatio = avgInputCount / Math.max(avgOutputCount, 1);

    // Analyze change patterns
    const changeCount = mixingPatterns.filter(p => p.isChange).length;
    const changePatternScore = changeCount / mixingPatterns.length;

    // Count CoinJoin participation
    const coinjoinParticipation = mixingPatterns.filter(p => p.isCoinJoin).length;

    // Calculate mixing score
    let mixingScore = 0;
    if (avgInputCount > 3) mixingScore += 0.3;
    if (avgOutputCount > 5) mixingScore += 0.3;
    if (coinjoinParticipation > 2) mixingScore += 0.4;

    // Determine privacy rating
    let privacyRating = "LOW";
    if (mixingScore > 0.7) privacyRating = "HIGH";
    else if (mixingScore > 0.4) privacyRating = "MEDIUM";

    this.mixingProfiles.set(address, {
      address,
      avgInputCount,
      avgOutputCount,
      inputOutputRatio,
      changePatternScore,
      mixingScore,
      coinjoinParticipation,
      privacyRating
    });
  }

  /**
   * Calculate variance for array of numbers
   */
  private calculateVariance(values: number[], mean: number): number {
    if (values.length <= 1) return 0;
    
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / (values.length - 1);
  }

  /**
   * Calculate overall suspicion score for address
   * Combines timing, amount, and mixing scores
   */
  private calculateOverallSuspicionScore(address: string): number {
    const timing = this.timingProfiles.get(address);
    const amount = this.amountSignatures.get(address);
    const mixing = this.mixingProfiles.get(address);

    let score = 0;
    let components = 0;

    // Timing component (high regularity is suspicious)
    if (timing) {
      if (timing.regularityScore > this.HIGH_REGULARITY_THRESHOLD) {
        score += timing.regularityScore * 0.4;
      }
      components++;
    }

    // Amount component (suspicious patterns)
    if (amount) {
      let amountScore = 0;
      if (amount.suspiciousPatterns.length > 0) {
        amountScore = Math.min(1, amount.suspiciousPatterns.length * 0.3);
      }
      score += amountScore * 0.3;
      components++;
    }

    // Mixing component (high mixing can be suspicious in some contexts)
    if (mixing) {
      if (mixing.mixingScore > this.HIGH_MIXING_THRESHOLD) {
        score += mixing.mixingScore * 0.3;
      }
      components++;
    }

    return components > 0 ? score / components : 0;
  }

  /**
   * Get primary suspicious category for address
   */
  private getPrimarySuspiciousCategory(address: string): string {
    const timing = this.timingProfiles.get(address);
    const amount = this.amountSignatures.get(address);
    const mixing = this.mixingProfiles.get(address);

    let maxScore = 0;
    let category = "UNKNOWN";

    if (timing && timing.regularityScore > this.HIGH_REGULARITY_THRESHOLD) {
      if (timing.regularityScore > maxScore) {
        maxScore = timing.regularityScore;
        category = "BOT_BEHAVIOR";
      }
    }

    if (amount && amount.suspiciousPatterns.length > 0) {
      const amountScore = amount.suspiciousPatterns.length * 0.3;
      if (amountScore > maxScore) {
        maxScore = amountScore;
        category = "SUSPICIOUS_AMOUNTS";
      }
    }

    if (mixing && mixing.mixingScore > this.HIGH_MIXING_THRESHOLD) {
      if (mixing.mixingScore > maxScore) {
        maxScore = mixing.mixingScore;
        category = "PRIVACY_TOOLS";
      }
    }

    return category;
  }

  /**
   * Update suspicion score for address in sorted array
   * O(log N) operation for binary search + array manipulation
   */
  private updateSuspicionScore(address: string): void {
    const newScore = this.calculateOverallSuspicionScore(address);
    const newCategory = this.getPrimarySuspiciousCategory(address);
    
    // Remove existing entry if present
    const existingIndex = this.suspicionScores.findIndex(entry => entry.address === address);
    if (existingIndex !== -1) {
      this.suspicionScores.splice(existingIndex, 1);
    }

    // Only add if score is significant
    if (newScore < 0.1) return;

    // Find insertion point using binary search
    let left = 0;
    let right = this.suspicionScores.length;
    
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const midScore = this.suspicionScores[mid].overallScore;
      
      if (newScore > midScore) {
        right = mid;
      } else {
        left = mid + 1;
      }
    }

    // Insert at correct position
    this.suspicionScores.splice(left, 0, {
      address,
      overallScore: newScore,
      category: newCategory
    });
  }

  /**
   * Maintain top N tracked addresses by suspicion score
   * Remove least suspicious addresses when limit exceeded
   */
  private limitTrackedAddresses(): void {
    if (this.suspicionScores.length <= this.maxTrackedAddresses) {
      return; // No trimming needed
    }

    // Remove addresses that fell out of top N
    const addressesToRemove = this.suspicionScores
      .slice(this.maxTrackedAddresses)
      .map(entry => entry.address);

    // Trim sorted array to top N
    this.suspicionScores = this.suspicionScores.slice(0, this.maxTrackedAddresses);

    // Remove addresses and their associated data
    for (const address of addressesToRemove) {
      this.removeAddressCompletely(address);
    }
  }

  /**
   * Remove address and all associated profile data
   */
  private removeAddressCompletely(address: string): void {
    this.timingProfiles.delete(address);
    this.amountSignatures.delete(address);
    this.mixingProfiles.delete(address);
    this.addressTransactions.delete(address);
  }

  // =============================================================================
  // PUBLIC QUERY METHODS (Read-only API for external consumption)
  // =============================================================================

  /**
   * Get timing profile for specific address
   */
  public getTimingProfile(address: string): TimingProfile | null {
    return this.timingProfiles.get(address) || null;
  }

  /**
   * Get amount signature for specific address
   */
  public getAmountSignature(address: string): AmountSignature | null {
    return this.amountSignatures.get(address) || null;
  }

  /**
   * Get mixing profile for specific address
   */
  public getMixingProfile(address: string): MixingProfile | null {
    return this.mixingProfiles.get(address) || null;
  }

  /**
   * Get overall suspicion score for specific address
   */
  public getSuspicionScore(address: string): number {
    const entry = this.suspicionScores.find(e => e.address === address);
    return entry ? entry.overallScore : 0;
  }

  /**
   * Get top N most suspicious addresses
   * O(1) operation using pre-sorted array
   */
  public getTopSuspiciousAddresses(limit?: number): SuspicionEntry[] {
    const actualLimit = limit || 100;
    return this.suspicionScores.slice(0, actualLimit);
  }

  /**
   * Get addresses by specific suspicious category
   */
  public getAddressesByCategory(category: string, limit?: number): SuspicionEntry[] {
    const actualLimit = limit || 100;
    return this.suspicionScores
      .filter(entry => entry.category === category)
      .slice(0, actualLimit);
  }

  /**
   * Get comprehensive analysis for specific address
   */
  public getComprehensiveAnalysis(address: string): any {
    const timing = this.getTimingProfile(address);
    const amount = this.getAmountSignature(address);
    const mixing = this.getMixingProfile(address);
    const suspicionScore = this.getSuspicionScore(address);
    const category = this.getPrimarySuspiciousCategory(address);

    return {
      address,
      overallScore: suspicionScore,
      primaryCategory: category,
      timing,
      amount,
      mixing,
      analysisDate: new Date().toISOString()
    };
  }

  /**
   * Get addresses with bot-like behavior
   */
  public getBotLikeAddresses(limit?: number): TimingProfile[] {
    const actualLimit = limit || 50;
    return Array.from(this.timingProfiles.values())
      .filter(profile => profile.regularityScore > this.HIGH_REGULARITY_THRESHOLD)
      .sort((a, b) => b.regularityScore - a.regularityScore)
      .slice(0, actualLimit);
  }

  /**
   * Get addresses with high mixing activity
   */
  public getHighMixingAddresses(limit?: number): MixingProfile[] {
    const actualLimit = limit || 50;
    return Array.from(this.mixingProfiles.values())
      .filter(profile => profile.mixingScore > this.HIGH_MIXING_THRESHOLD)
      .sort((a, b) => b.mixingScore - a.mixingScore)
      .slice(0, actualLimit);
  }

  /**
   * Get system statistics and memory usage estimates
   */
  public getStorageStats(): any {
    const timingMemory = this.timingProfiles.size * 200; // ~200 bytes per profile
    const amountMemory = this.amountSignatures.size * 300; // ~300 bytes per signature
    const mixingMemory = this.mixingProfiles.size * 150; // ~150 bytes per profile
    const scoresMemory = this.suspicionScores.length * 80; // ~80 bytes per score
    const transactionMemory = Array.from(this.addressTransactions.values())
      .reduce((sum, patterns) => sum + patterns.length * 100, 0); // ~100 bytes per pattern
    const timestampMemory = this.blockTimestamps.size * 12; // ~12 bytes per timestamp
    
    return {
      trackedAddresses: Math.max(
        this.timingProfiles.size,
        this.amountSignatures.size,
        this.mixingProfiles.size
      ),
      suspiciousAddresses: this.suspicionScores.length,
      transactionPatterns: Array.from(this.addressTransactions.values())
        .reduce((sum, patterns) => sum + patterns.length, 0),
      estimatedMemoryUsage: {
        timingProfiles: `${Math.round(timingMemory / 1024)}KB`,
        amountSignatures: `${Math.round(amountMemory / 1024)}KB`,
        mixingProfiles: `${Math.round(mixingMemory / 1024)}KB`,
        suspicionScores: `${Math.round(scoresMemory / 1024)}KB`,
        transactionPatterns: `${Math.round(transactionMemory / 1024)}KB`,
        blockTimestamps: `${Math.round(timestampMemory / 1024)}KB`,
        total: `${Math.round((timingMemory + amountMemory + mixingMemory + scoresMemory + transactionMemory + timestampMemory) / 1024 / 1024)}MB`
      },
      config: {
        maxTrackedAddresses: this.maxTrackedAddresses,
        timingWindowSize: this.TIMING_WINDOW_SIZE,
        amountWindowSize: this.AMOUNT_WINDOW_SIZE,
        mixingWindowSize: this.MIXING_WINDOW_SIZE,
        highRegularityThreshold: this.HIGH_REGULARITY_THRESHOLD,
        highMixingThreshold: this.HIGH_MIXING_THRESHOLD
      }
    };
  }

  /**
   * Get pattern distribution statistics
   */
  public getPatternDistribution(): any {
    const categories = new Map<string, number>();
    for (const entry of this.suspicionScores) {
      categories.set(entry.category, (categories.get(entry.category) || 0) + 1);
    }

    const timingStats = {
      total: this.timingProfiles.size,
      highRegularity: Array.from(this.timingProfiles.values())
        .filter(p => p.regularityScore > this.HIGH_REGULARITY_THRESHOLD).length
    };

    const mixingStats = {
      total: this.mixingProfiles.size,
      highMixing: Array.from(this.mixingProfiles.values())
        .filter(p => p.mixingScore > this.HIGH_MIXING_THRESHOLD).length,
      privacyRatings: {
        LOW: Array.from(this.mixingProfiles.values()).filter(p => p.privacyRating === "LOW").length,
        MEDIUM: Array.from(this.mixingProfiles.values()).filter(p => p.privacyRating === "MEDIUM").length,
        HIGH: Array.from(this.mixingProfiles.values()).filter(p => p.privacyRating === "HIGH").length
      }
    };

    return {
      suspiciousCategories: Object.fromEntries(categories),
      timingAnalysis: timingStats,
      mixingAnalysis: mixingStats,
      totalAnalyzedAddresses: new Set([
        ...this.timingProfiles.keys(),
        ...this.amountSignatures.keys(), 
        ...this.mixingProfiles.keys()
      ]).size
    };
  }
}