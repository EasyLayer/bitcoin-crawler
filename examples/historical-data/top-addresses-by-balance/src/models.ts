import { v4 as uuidv4 } from 'uuid';
import { Model } from '@easylayer/bitcoin-crawler';
import { ScriptUtilService, Block, NetworkConfig } from '@easylayer/bitcoin';
import { Money, Currency } from '@easylayer/common/arithmetic';
import {
  AddressBalanceChangedEvent,
  AddressOutput,
  AddressInput,
} from './events';

export const CURRENCY: Currency = {
  code: 'BTC',
  minorUnit: 8,
};

export interface AddressState {
  address: string;
  balance: string; // in satoshi as string for precision
  firstSeen: number; // block height when first encountered
  lastActivity: number; // block height of last activity
  utxoCount: number; // number of large unspent outputs we track
}

export default class TopAddressesByBalanceModel extends Model {
  // Configuration
  private topLimit: number = 1000;
  private minimumUtxoValue: string = "10000000"; // 0.1 BTC in satoshi - only store large UTXOs
  
  // Storage for address states - aggregated balance info
  private addressStates: Map<string, AddressState> = new Map();
  
  // Storage for large UTXO set only - memory efficient
  // Key: "txid_n", Value: AddressOutput
  private largeUtxoSet: Map<string, AddressOutput> = new Map();

  constructor() {
    super('top-addresses-by-balance-aggregate');
  }

  protected toJsonPayload(): any {
    return {
      topLimit: this.topLimit,
      minimumUtxoValue: this.minimumUtxoValue,
      addressStates: Array.from(this.addressStates.entries()),
      largeUtxoSet: Array.from(this.largeUtxoSet.entries()),
    };
  }

  protected fromSnapshot(state: any): void {
    if (state.topLimit !== undefined) {
      this.topLimit = state.topLimit;
    }
    if (state.minimumUtxoValue !== undefined) {
      this.minimumUtxoValue = state.minimumUtxoValue;
    }
    
    if (state.addressStates && Array.isArray(state.addressStates)) {
      this.addressStates = new Map(state.addressStates);
    }
    
    if (state.largeUtxoSet && Array.isArray(state.largeUtxoSet)) {
      this.largeUtxoSet = new Map(state.largeUtxoSet);
    }
    
    Object.setPrototypeOf(this, TopAddressesByBalanceModel.prototype);
  }

  async parseBlock({ block, networkConfig }: { block: Block; networkConfig: NetworkConfig }) {
    const { tx, height } = block;
    
    const newOutputs: AddressOutput[] = [];
    const spentInputs: AddressInput[] = [];

    // Process all transactions in the block
    for (let txIndex = 0; txIndex < tx.length; txIndex++) {
      const transaction = tx[txIndex];
      const { txid, vin, vout } = transaction;

      // First, process inputs (spending existing UTXOs)
      for (const input of vin) {
        // Skip coinbase transactions (they don't spend existing UTXOs)
        if (input.coinbase) {
          continue;
        }

        if (input.txid && input.vout !== undefined) {
          spentInputs.push({
            txid: input.txid,
            n: input.vout
          });
        }
      }

      // Then, process outputs (creating new UTXOs)
      for (const output of vout) {
        const address = this.extractAddressFromVout(output, networkConfig);
        
        if (!address) {
          continue; // Skip outputs we can't parse
        }

        const value = Money.fromDecimal(output.value.toString(), CURRENCY).toCents();
        
        newOutputs.push({
          address,
          txid,
          n: output.n,
          value
        });
      }
    }

    // Apply event only if there are changes
    if (newOutputs.length > 0 || spentInputs.length > 0) {
      await this.apply(
        new AddressBalanceChangedEvent({
          aggregateId: this.aggregateId,
          requestId: uuidv4(),
          blockHeight: height,
          outputs: newOutputs,
          inputs: spentInputs
        })
      );
    }
  }

  // Extract address from transaction output
  private extractAddressFromVout(vout: any, networkConfig: any): string | undefined {
    try {
      // Try to extract address from scriptPubKey.addresses first
      if (vout.scriptPubKey?.addresses && vout.scriptPubKey.addresses.length > 0) {
        return vout.scriptPubKey.addresses[0];
      }

      // Alternative method using ScriptUtilService
      const scriptHash = ScriptUtilService.getScriptHashFromScriptPubKey(
        vout.scriptPubKey, 
        networkConfig.network
      );
      return scriptHash;
    } catch (error) {
      // Ignore script parsing errors for unsupported script types
      return undefined;
    }
  }

  // Handle the balance changed event (IDEMPOTENT)
  private onAddressBalanceChangedEvent({ payload }: AddressBalanceChangedEvent) {
    const { outputs, inputs, blockHeight } = payload;

    // Step 1: Process spent inputs (remove large UTXOs from our set)
    for (const input of inputs) {
      const utxoKey = `${input.txid}_${input.n}`;
      const existingUtxo = this.largeUtxoSet.get(utxoKey);
      
      if (existingUtxo) {
        // This large UTXO exists in our set - remove it and update balance
        this.largeUtxoSet.delete(utxoKey);
        this.subtractFromBalance(existingUtxo.address, existingUtxo.value, blockHeight);
      }
      // If UTXO doesn't exist in our set, it means:
      // 1. It was created before our start block, OR
      // 2. It was smaller than minimumUtxoValue
      // In both cases, we ignore it (balance tracking won't be 100% accurate)
    }

    // Step 2: Process new outputs (add to balance, store large UTXOs)
    for (const output of outputs) {
      const utxoKey = `${output.txid}_${output.n}`;
      
      // Only add if not already exists (IDEMPOTENT)
      if (!this.largeUtxoSet.has(utxoKey)) {
        // Always update balance for all outputs
        this.addToBalance(output.address, output.value, blockHeight);
        
        // Store UTXO only if it's large enough
        if (this.isLargeUtxo(output.value)) {
          this.largeUtxoSet.set(utxoKey, output);
        }
      }
    }

    // Step 3: Maintain top addresses limit
    this.limitToTopAddresses();
  }

  // Check if UTXO is large enough to store
  private isLargeUtxo(value: string): boolean {
    return BigInt(value) >= BigInt(this.minimumUtxoValue);
  }

  // Add to address balance (for all outputs)
  private addToBalance(address: string, value: string, blockHeight: number) {
    let addressState = this.addressStates.get(address);

    if (!addressState) {
      // Create new address entry
      addressState = {
        address,
        balance: '0',
        firstSeen: blockHeight,
        lastActivity: blockHeight,
        utxoCount: 0
      };
      this.addressStates.set(address, addressState);
    }

    // Add value to balance
    const currentBalance = BigInt(addressState.balance);
    const addition = BigInt(value);
    addressState.balance = (currentBalance + addition).toString();
    addressState.lastActivity = blockHeight;
    
    // Increment UTXO count only for large UTXOs
    if (this.isLargeUtxo(value)) {
      addressState.utxoCount++;
    }
  }

  // Subtract from address balance (only for large UTXOs we track)
  private subtractFromBalance(address: string, value: string, blockHeight: number) {
    const addressState = this.addressStates.get(address);
    
    if (!addressState) {
      return; // Address doesn't exist in our tracking
    }

    // Subtract value from balance
    const currentBalance = BigInt(addressState.balance);
    const subtraction = BigInt(value);
    const newBalance = currentBalance - subtraction;
    
    // Update balance (ensure it doesn't go negative)
    addressState.balance = newBalance >= 0n ? newBalance.toString() : '0';
    addressState.lastActivity = blockHeight;
    addressState.utxoCount = Math.max(0, addressState.utxoCount - 1);

    // If balance becomes 0, remove from tracking
    if (addressState.balance === '0' && addressState.utxoCount === 0) {
      this.addressStates.delete(address);
    }
  }

  // Keep only top addresses by balance and clean up related UTXOs
  private limitToTopAddresses() {
    if (this.addressStates.size <= this.topLimit) {
      return; // No need to limit
    }

    // Get all addresses sorted by balance (descending)
    const sortedAddresses = Array.from(this.addressStates.values())
      .sort((a, b) => {
        const balanceA = BigInt(a.balance);
        const balanceB = BigInt(b.balance);
        if (balanceA > balanceB) return -1;
        if (balanceA < balanceB) return 1;
        return 0;
      });

    // Keep only top addresses
    const topAddresses = sortedAddresses.slice(0, this.topLimit);
    const topAddressSet = new Set(topAddresses.map(addr => addr.address));
    
    // Remove addresses that are no longer in top
    const addressesToRemove = Array.from(this.addressStates.keys())
      .filter(address => !topAddressSet.has(address));
    
    for (const address of addressesToRemove) {
      this.addressStates.delete(address);
    }

    // Clean up large UTXOs that belong to removed addresses
    const utxosToRemove: string[] = [];
    for (const [utxoKey, utxo] of this.largeUtxoSet) {
      if (!topAddressSet.has(utxo.address)) {
        utxosToRemove.push(utxoKey);
      }
    }
    
    for (const utxoKey of utxosToRemove) {
      this.largeUtxoSet.delete(utxoKey);
    }
  }

  // Helper methods for queries
  public getAddressBalance(address: string): string {
    const addressState = this.addressStates.get(address);
    return addressState ? addressState.balance : '0';
  }

  public getAddressLargeUtxoCount(address: string): number {
    return Array.from(this.largeUtxoSet.values())
      .filter(utxo => utxo.address === address)
      .length;
  }

  public getAddressLargeUtxos(address: string): AddressOutput[] {
    return Array.from(this.largeUtxoSet.values())
      .filter(utxo => utxo.address === address);
  }

  public getStorageStats(): any {
    return {
      addressCount: this.addressStates.size,
      largeUtxoCount: this.largeUtxoSet.size,
      config: {
        topLimit: this.topLimit,
        minimumUtxoValue: this.minimumUtxoValue,
        minimumUtxoValueBTC: Money.fromCents(this.minimumUtxoValue, CURRENCY).toString()
      }
    };
  }
}