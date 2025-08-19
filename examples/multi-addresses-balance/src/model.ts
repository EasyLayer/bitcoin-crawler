import { v4 as uuidv4 } from 'uuid';
import { Model } from '@easylayer/bitcoin-crawler';
import { ScriptUtilService, Block, NetworkConfig } from '@easylayer/bitcoin';
import { Money, Currency } from '@easylayer/common/arithmetic';
import {
  PortfolioBalanceChangedEvent,
  AddressOutput,
  AddressInput,
} from './events';
import P from './profiler';

export const CURRENCY: Currency = {
  code: 'BTC',
  minorUnit: 8,
};

/**
 * Individual address balance within the portfolio
 */
interface AddressBalance {
  address: string;                  // Bitcoin address
  balance: string;                  // Current balance in satoshi
  firstSeen: number;                // Block height when first seen
  lastActivity: number;             // Block height of most recent activity
  transactionCount: number;         // Total transactions for this address
}

/**
 * UTXO storage for tracking unspent outputs
 */
interface StoredUtxo {
  address: string;                  // Owner address
  value: string;                    // UTXO value in satoshi
}

export const UNIQ_MODEL_NAME = 'multi-address-balance';

/**
 * MultiAddressBalanceModel - Tracks balances for a predefined set of Bitcoin addresses
 * 
 * MEMORY USAGE ANALYSIS:
 * - addressBalances: ~120 bytes × N addresses = bounded by config
 * - utxoLookup: ~100 bytes × M UTXOs = bounded by unspent outputs (NOT unlimited!)
 * - scriptToAddress: ~50 bytes × S scripts = bounded by config
 * 
 * MEMORY GROWTH PATTERN:
 * - Bounded growth: All data structures are bounded by address set and UTXO lifecycle
 * - UTXOs are REMOVED when spent, so memory doesn't grow infinitely
 * - For 1000 addresses: ~120KB + reasonable UTXO storage (~1-10MB typical)
 * 
 * PERFORMANCE CHARACTERISTICS:
 * - Script matching: O(1) for 99% cases (Step 1-2), O(complex) rarely (Step 3)
 * - Balance updates: O(1) with running total maintenance
 * - UTXO operations: O(1) lookup, automatic cleanup on spend
 * 
 * TIME COMPLEXITY:
 * - parseBlock: O(transactions × outputs) + O(inputs) for UTXO lookup
 * - extractAddressFromVout: O(1) best case, O(complex) worst case
 * - Balance operations: O(1) per address, O(N) for total recalc
 */
export default class MultiAddressBalanceModel extends Model {
  // Only store UTXOs >= 0.001 BTC to avoid dust (100K satoshi)
  private minimumUtxoValue: string = "100000";
  
  // =============================================================================
  // PORTFOLIO CONFIGURATION - EDIT HERE TO SET YOUR ADDRESSES
  // =============================================================================
  
  /**
   * Portfolio addresses with their scripts for optimization
   * Key: Bitcoin address
   * Value: Array of script hex (empty array = no scripts, will use fallback parsing)
   */
  private readonly PORTFOLIO_CONFIG: Record<string, string[]> = {
    // Satoshi addresses
    "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa": ["76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac"],
    "12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX": [],
    
    // Binance addresses  
    "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo": ["76a914389ffce9cd9ae88dcc0631e88a821ffdbe9bfe2615488ac"],
    "3LYJfcfHPXYJreMsASk2jkn69LWEYKzexb": ["a9149f9a7abd600c0caa03983a77c8c3df8e062cb2fa87"],
    "bc1qm34lsc65zpw79lxes69zkqmk6luv9mwsqstqlh": ["0014c4c5abd64c99d2a40031eda16a79c93b92e7d7f6"],
    
    // Add your addresses here...
    // "your-address": ["script1", "script2"] or [] for fallback parsing
  };

  /**
   * Core storage - memory analysis per data structure
   */
  private totalBalance: string = "0";                       // Total portfolio balance: 8 bytes
  
  /**
   * Address balances: BOUNDED memory growth
   * Memory: ~120 bytes × N addresses (where N = fixed config size)
   * Access: O(1) lookup, O(N) iteration for total balance
   */
  private addressBalances: Map<string, AddressBalance> = new Map();
  
  /**
   * UTXO lookup: BOUNDED memory growth (NOT unlimited!)
   * Memory: ~100 bytes × M UTXOs (where M is bounded by address set activity)
   * Growth pattern: UTXOs added on creation, REMOVED when spent
   * Actual limit: Limited by number of concurrent unspent outputs for tracked addresses
   * Access: O(1) lookup by txid_vout key
   */
  private utxoLookup: Map<string, StoredUtxo> = new Map();
  
  /**
   * Script-to-address mapping: BOUNDED memory growth
   * Memory: ~50 bytes × S scripts (where S = fixed config size)
   * Performance boost: O(1) script matching vs O(complex) parsing
   */
  private scriptToAddress: Map<string, string> = new Map();

  constructor() {
    super(UNIQ_MODEL_NAME);
    this.initializePortfolio();
  }

  /**
   * Initialize portfolio from PORTFOLIO_CONFIG
   * Time complexity: O(A + S) where A=addresses, S=scripts
   * Memory allocation: Fixed based on config size
   */
  private initializePortfolio(): void {
    // Initialize address balances
    for (const [address, scripts] of Object.entries(this.PORTFOLIO_CONFIG)) {
      this.addressBalances.set(address, {
        address,
        balance: '0',
        firstSeen: 0,
        lastActivity: 0,
        transactionCount: 0
      });
      
      // Build script lookup for performance
      for (const scriptHex of scripts) {
        this.scriptToAddress.set(scriptHex, address);
      }
    }
  }

  /**
   * Serialize model state for persistence
   */
  protected toJsonPayload(): any {
    return {
      minimumUtxoValue: this.minimumUtxoValue,
      totalBalance: this.totalBalance,
      addressBalances: Array.from(this.addressBalances.entries()),
      utxoLookup: Array.from(this.utxoLookup.entries()),
    };
  }

  /**
   * Deserialize model state from persistence
   */
  protected fromSnapshot(state: any): void {
    if (state.minimumUtxoValue !== undefined) this.minimumUtxoValue = state.minimumUtxoValue;
    if (state.totalBalance !== undefined) this.totalBalance = state.totalBalance;
    
    // Initialize portfolio first
    this.initializePortfolio();
    
    // Restore address balances
    if (state.addressBalances && Array.isArray(state.addressBalances)) {
      this.addressBalances = new Map(state.addressBalances);
    }
    
    // Restore UTXO lookup
    if (state.utxoLookup && Array.isArray(state.utxoLookup)) {
      this.utxoLookup = new Map(state.utxoLookup);
    }
    
    Object.setPrototypeOf(this, MultiAddressBalanceModel.prototype);
  }

  /**
   * Parse block and extract relevant transactions
   * PERFORMANCE ANALYSIS:
   * - Time complexity: O(T × O) where T=transactions, O=outputs
   * - Memory impact: Grows utxoLookup by new UTXOs, shrinks by spent UTXOs
   * - Bottleneck: extractAddressFromVout() for unknown scripts
   */
  async parseBlock({ block, networkConfig }: { block: Block; networkConfig: NetworkConfig }) {
    const { tx, height } = block;

    const newOutputs: AddressOutput[] = [];
    const spentInputs: AddressInput[] = [];

    let vinTime = 0n;
    let voutTime = 0n;
    let scriptTime = 0n;
    let applyTime = 0n;

    for (const transaction of tx) {
      const { txid, vin, vout } = transaction;

      const tVin0 = P.now();
      for (const input of vin) {
        if (input.coinbase) continue;
        if (input.txid && input.vout !== undefined) {
          spentInputs.push({ txid: input.txid, n: input.vout });
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
        newOutputs.push({ address, txid, n: output.n, value });
      }
      voutTime += P.now() - tVout0;
    }

    if (newOutputs.length > 0 || spentInputs.length > 0) {
      const tA0 = P.now();
      await this.apply(
        new PortfolioBalanceChangedEvent({
          aggregateId: this.aggregateId,
          requestId: uuidv4(),
          blockHeight: height,
          outputs: newOutputs,
          inputs: spentInputs,
        }),
      );
      applyTime = P.now() - tA0;
    }

    P.mark(`h${height}`);
    P.add(vinTime, voutTime, scriptTime, 0n, applyTime);
  }

  /**
   * Extract Bitcoin address from transaction output with optimized script matching
   * PERFORMANCE CRITICAL FUNCTION:
   * - Step 1: O(1) - Direct address lookup (fastest path)
   * - Step 2: O(1) - Pre-built script hash lookup (fast path) 
   * - Step 3: O(complex) - Expensive script parsing
   * 
   * OPTIMIZATION STRATEGY:
   * - Pre-define scripts in config to hit Step 2 instead of Step 3
   * - Step 3 fallback is 10-100x slower than Step 2
   */
  private extractAddressFromVout(vout: any, networkConfig: any): string | undefined {
    // Step 1: Check direct address in scriptPubKey
    if (vout.scriptPubKey?.addresses && vout.scriptPubKey.addresses.length > 0) {
      const address = vout.scriptPubKey.addresses[0];
      if (this.addressBalances.has(address)) {
        return address;
      }
    }

    // Step 2: Fast script matching using pre-built lookup
    if (vout.scriptPubKey?.hex) {
      const scriptHex = vout.scriptPubKey.hex;
      const address = this.scriptToAddress.get(scriptHex);
      if (address) {
        return address;
      }
    }

    // Step 3: Fallback - expensive script parsing only for unrecognized scripts
    try {
      const scriptHash = ScriptUtilService.getScriptHashFromScriptPubKey(
        vout.scriptPubKey, 
        networkConfig.network
      );
      
      if (scriptHash && this.addressBalances.has(scriptHash)) {
        return scriptHash;
      }
    } catch (error) {
      // Ignore unsupported script types
    }

    return undefined;
  }

  /**
   * Event handler for balance changes
   * COMPLEXITY ANALYSIS:
   * - Time: O(I + O) where I=inputs, O=outputs
   * - Memory: UTXOs grow by |outputs|, shrink by |inputs| - BOUNDED by address set
   * - OPTIMIZATION: Running total updates instead of full recalculation
   */
  private onPortfolioBalanceChangedEvent({ payload }: PortfolioBalanceChangedEvent) {
    const { outputs, inputs, blockHeight } = payload;

    // Step 1: Process spent inputs (remove UTXOs, subtract balances)
    for (const input of inputs) {
      const utxoKey = `${input.txid}_${input.n}`;
      const existingUtxo = this.utxoLookup.get(utxoKey);
      if (existingUtxo) {
        this.utxoLookup.delete(utxoKey); // Memory freed when spent
        this.subtractFromBalance(existingUtxo.address, existingUtxo.value, blockHeight);
      }
    }

    // Step 2: Process new outputs (add balances, store UTXOs)
    for (const output of outputs) {
      const utxoKey = `${output.txid}_${output.n}`;
      if (!this.utxoLookup.has(utxoKey)) {
        this.addToBalance(output.address, output.value, blockHeight);
        
        // Store UTXO if it meets minimum threshold
        if (this.isSignificantUtxo(output.value)) {
          this.utxoLookup.set(utxoKey, {
            address: output.address,
            value: output.value
          });
        }
      }
    }

    // Step 3: No recalculation needed - running total maintained!
  }

  /**
   * Check if UTXO is significant enough to store
   * Memory optimization: Only store UTXOs above threshold to reduce memory usage
   * Trade-off: Saves memory but loses tracking of small UTXOs
   */
  private isSignificantUtxo(value: string): boolean {
    return BigInt(value) >= BigInt(this.minimumUtxoValue);
  }

  /**
   * Add value to address balance and update statistics
   * Time complexity: O(1) - direct address update + running total update
   */
  private addToBalance(address: string, value: string, blockHeight: number) {
    const addressBalance = this.addressBalances.get(address);
    if (!addressBalance) return; // Not our address

    const valueAmount = BigInt(value);
    const currentBalance = BigInt(addressBalance.balance);
    
    addressBalance.balance = (currentBalance + valueAmount).toString();
    addressBalance.lastActivity = blockHeight;
    addressBalance.transactionCount++;
    
    if (addressBalance.firstSeen === 0) {
      addressBalance.firstSeen = blockHeight;
    }

    // Update running total: O(1) instead of O(N) recalculation
    const currentTotal = BigInt(this.totalBalance);
    this.totalBalance = (currentTotal + valueAmount).toString();
  }

  /**
   * Subtract value from address balance
   * Time complexity: O(1) - direct address update + running total update
   */
  private subtractFromBalance(address: string, value: string, blockHeight: number) {
    const addressBalance = this.addressBalances.get(address);
    if (!addressBalance) return; // Not our address

    const currentBalance = BigInt(addressBalance.balance);
    const subtraction = BigInt(value);
    const newBalance = currentBalance - subtraction;
    
    addressBalance.balance = newBalance >= 0n ? newBalance.toString() : '0';
    addressBalance.lastActivity = blockHeight;
    addressBalance.transactionCount++;

    // Update running total: O(1) instead of O(N) recalculation
    const currentTotal = BigInt(this.totalBalance);
    this.totalBalance = (currentTotal - subtraction >= 0n) 
      ? (currentTotal - subtraction).toString() 
      : '0';
  }

  // Remove the old recalculateTotalBalance method - no longer needed!
  // Running total is maintained in addToBalance() and subtractFromBalance()

  // =============================================================================
  // PUBLIC QUERY METHODS
  // =============================================================================

  /**
   * Get current total portfolio balance
   */
  public getTotalBalance(): string {
    return this.totalBalance;
  }

  /**
   * Get total portfolio balance in BTC
   */
  public getTotalBalanceBTC(): number {
    return Number(BigInt(this.totalBalance) / BigInt(100000000));
  }

  /**
   * Get balance for specific address
   */
  public getAddressBalance(address: string): string {
    const addressBalance = this.addressBalances.get(address);
    return addressBalance ? addressBalance.balance : '0';
  }

  /**
   * Get all address balances sorted by balance
   * Time complexity: O(N log N) where N = number of addresses
   * Memory: Creates temporary array, no additional permanent storage
   */
  public getAllAddressBalances(): AddressBalance[] {
    return Array.from(this.addressBalances.values())
      .sort((a, b) => {
        const balanceA = BigInt(a.balance);
        const balanceB = BigInt(b.balance);
        return balanceA > balanceB ? -1 : (balanceA < balanceB ? 1 : 0);
      });
  }

  /**
   * Get all UTXOs for the portfolio
   * Time complexity: O(U log U) where U = number of UTXOs
   * Memory impact: Creates temporary array from utxoLookup Map
   * Potential issue: Large result set if many UTXOs accumulated
   */
  public getAllUtxos(): AddressOutput[] {
    const utxos: AddressOutput[] = [];
    
    for (const [utxoKey, utxo] of this.utxoLookup) {
      const [txid, nStr] = utxoKey.split('_');
      utxos.push({
        address: utxo.address,
        txid,
        n: parseInt(nStr),
        value: utxo.value
      });
    }
    
    // Sort by value descending
    return utxos.sort((a, b) => {
      const valueA = BigInt(a.value);
      const valueB = BigInt(b.value);
      return valueA > valueB ? -1 : (valueA < valueB ? 1 : 0);
    });
  }

  /**
   * Get UTXOs for specific address
   */
  public getUtxosForAddress(address: string): AddressOutput[] {
    return this.getAllUtxos().filter(utxo => utxo.address === address);
  }

  /**
   * Get portfolio statistics
   */
  public getPortfolioStats(): any {
    const addressCount = this.addressBalances.size;
    const utxoCount = this.utxoLookup.size;
    
    let totalTransactions = 0;
    let firstSeen = Number.MAX_SAFE_INTEGER;
    let lastActivity = 0;
    let largestAddress = '';
    let largestBalance = BigInt(0);
    
    for (const addressBalance of this.addressBalances.values()) {
      totalTransactions += addressBalance.transactionCount;
      
      if (addressBalance.firstSeen > 0 && addressBalance.firstSeen < firstSeen) {
        firstSeen = addressBalance.firstSeen;
      }
      
      if (addressBalance.lastActivity > lastActivity) {
        lastActivity = addressBalance.lastActivity;
      }
      
      const balance = BigInt(addressBalance.balance);
      if (balance > largestBalance) {
        largestBalance = balance;
        largestAddress = addressBalance.address;
      }
    }

    // Calculate diversification score
    const diversificationScore = this.calculateDiversificationScore();

    return {
      portfolioId: "tracked-portfolio",
      portfolioName: "My Tracked Addresses",
      totalBalance: this.totalBalance,
      totalBalanceBTC: this.getTotalBalanceBTC(),
      addressCount,
      utxoCount,
      totalTransactions,
      firstSeen: firstSeen === Number.MAX_SAFE_INTEGER ? 0 : firstSeen,
      lastActivity,
      largestAddress,
      largestBalance: largestBalance.toString(),
      diversificationScore
    };
  }

  /**
   * Calculate diversification score (0=concentrated, 1=evenly distributed)
   */
  private calculateDiversificationScore(): number {
    const addresses = Object.keys(this.PORTFOLIO_CONFIG);
    if (addresses.length <= 1) return 0;

    const totalBalance = BigInt(this.totalBalance);
    if (totalBalance === BigInt(0)) return 1;

    // Calculate Herfindahl-Hirschman Index (HHI)
    let hhi = 0;
    for (const address of addresses) {
      const balance = BigInt(this.getAddressBalance(address));
      const share = Number(balance * BigInt(10000) / totalBalance) / 10000;
      hhi += share * share;
    }

    // Convert HHI to diversification score
    const maxHhi = 1;
    const minHhi = 1 / addresses.length;
    
    if (maxHhi === minHhi) return 1;
    return Math.max(0, (maxHhi - hhi) / (maxHhi - minHhi));
  }

  /**
   * Get system configuration and tracked addresses
   */
  public getConfiguration(): any {
    return {
      portfolioId: "tracked-portfolio",
      portfolioName: "My Tracked Addresses",
      trackedAddresses: Object.keys(this.PORTFOLIO_CONFIG),
      addressesWithScripts: Object.entries(this.PORTFOLIO_CONFIG)
        .filter(([, scripts]) => scripts.length > 0)
        .map(([address]) => address),
      minimumUtxoValue: this.minimumUtxoValue,
      minimumUtxoValueBTC: Money.fromCents(this.minimumUtxoValue, CURRENCY).toString(),
      totalScriptMappings: this.scriptToAddress.size
    };
  }
}