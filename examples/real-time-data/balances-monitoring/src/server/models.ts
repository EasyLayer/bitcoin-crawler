import { v4 as uuidv4 } from 'uuid';
import { Model } from '@easylayer/bitcoin-crawler';
import { ScriptUtilService, Block, NetworkConfig } from '@easylayer/bitcoin';
import { Money, Currency } from '@easylayer/common/arithmetic';
import {
  WatchedAddressActivityEvent,
  WatchedOutput,
  WatchedInput,
} from './events';

// Currency configuration
export const CURRENCY: Currency = {
  code: 'BTC',
  minorUnit: 8,
};

// Address state interface for watched addresses
export interface WatchedAddressState {
  address: string;
  balance: string; // in satoshi as string for precision
  firstSeen: number; // block height when first encountered in our monitoring
  lastActivity: number; // block height of last activity
  utxoCount: number; // number of unspent outputs
  isActive: boolean; // whether we're currently monitoring this address
  addedAt: number; // block height when added to watchlist
}

// Watchlist configuration
export interface WatchlistConfig {
  maxAddresses: number; // maximum addresses to monitor
  autoRemoveInactive: boolean; // automatically remove inactive addresses
  inactiveThreshold: number; // blocks without activity before considered inactive
}

export default class AddressWatchlistModel extends Model {
  // List of addresses to monitor - just add them here
  private watchedAddresses: Set<string> = new Set([
    "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
    "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2", 
    "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy",
    // Add more addresses here...
  ]);
  
  // Storage for watched address states
  private addressStates: Map<string, WatchedAddressState> = new Map();
  
  // Storage for all UTXOs of watched addresses
  private utxoSet: Map<string, WatchedOutput> = new Map();

  constructor() {
    super('address-watchlist-aggregate');
  }

  protected toJsonPayload(): any {
    return {
      watchedAddresses: Array.from(this.watchedAddresses),
      addressStates: Array.from(this.addressStates.entries()),
      utxoSet: Array.from(this.utxoSet.entries()),
    };
  }

  protected fromSnapshot(state: any): void {
    if (state.watchedAddresses && Array.isArray(state.watchedAddresses)) {
      this.watchedAddresses = new Set(state.watchedAddresses);
    }
    
    if (state.addressStates && Array.isArray(state.addressStates)) {
      this.addressStates = new Map(state.addressStates);
    }
    
    if (state.utxoSet && Array.isArray(state.utxoSet)) {
      this.utxoSet = new Map(state.utxoSet);
    }
    
    Object.setPrototypeOf(this, AddressWatchlistModel.prototype);
  }

  async parseBlock({ block, networkConfig }: { block: Block; networkConfig: NetworkConfig }) {
    const { tx, height } = block;
    
    const watchedOutputs: WatchedOutput[] = [];
    const watchedInputs: WatchedInput[] = [];

    // Process all transactions in the block
    for (let txIndex = 0; txIndex < tx.length; txIndex++) {
      const transaction = tx[txIndex];
      const { txid, vin, vout } = transaction;

      // Process inputs (spending existing UTXOs)
      for (const input of vin) {
        // Skip coinbase transactions
        if (input.coinbase) {
          continue;
        }

        if (input.txid && input.vout !== undefined) {
          watchedInputs.push({
            txid: input.txid,
            n: input.vout
          });
        }
      }

      // Process outputs (creating new UTXOs) - ONLY for our watched addresses
      for (const output of vout) {
        const address = this.extractAddressFromVout(output, networkConfig);
        
        if (!address || !this.watchedAddresses.has(address)) {
          continue; // Skip - not one of our watched addresses
        }

        const value = Money.fromDecimal(output.value.toString(), CURRENCY).toCents();
        
        watchedOutputs.push({
          address,
          txid,
          n: output.n,
          value
        });
      }
    }

    // Apply event only if there are changes to our watched addresses
    if (watchedOutputs.length > 0 || watchedInputs.length > 0) {
      await this.apply(
        new WatchedAddressActivityEvent({
          aggregateId: this.aggregateId,
          requestId: uuidv4(),
          blockHeight: height,
          outputs: watchedOutputs,
          inputs: watchedInputs
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

  // Handle watched address activity event (IDEMPOTENT)
  private onWatchedAddressActivityEvent({ payload }: WatchedAddressActivityEvent) {
    const { outputs, inputs, blockHeight } = payload;

    // Step 1: Process spent inputs (remove UTXOs from our set)
    for (const input of inputs) {
      const utxoKey = `${input.txid}_${input.n}`;
      const existingUtxo = this.utxoSet.get(utxoKey);
      
      if (existingUtxo && this.watchedAddresses.has(existingUtxo.address)) {
        // This UTXO belongs to one of our watched addresses - remove it
        this.utxoSet.delete(utxoKey);
        this.subtractFromBalance(existingUtxo.address, existingUtxo.value, blockHeight);
      }
      // If UTXO doesn't exist or doesn't belong to watched address, ignore
    }

    // Step 2: Process new outputs (add UTXOs to our set)
    for (const output of outputs) {
      const utxoKey = `${output.txid}_${output.n}`;
      
      // Only add if not already exists (IDEMPOTENT) and address is watched
      if (!this.utxoSet.has(utxoKey) && this.watchedAddresses.has(output.address)) {
        this.utxoSet.set(utxoKey, output);
        this.addToBalance(output.address, output.value, blockHeight);
      }
    }
  }

  // Add UTXO and update address balance
  private addToBalance(address: string, value: string, blockHeight: number) {
    let addressState = this.addressStates.get(address);

    if (!addressState) {
      // First time seeing this watched address
      addressState = {
        address,
        balance: '0',
        firstSeen: blockHeight,
        lastActivity: blockHeight,
        utxoCount: 0,
        isActive: true,
        addedAt: blockHeight
      };
      this.addressStates.set(address, addressState);
    }

    // Add value to balance
    const currentBalance = BigInt(addressState.balance);
    const addition = BigInt(value);
    addressState.balance = (currentBalance + addition).toString();
    addressState.lastActivity = blockHeight;
    addressState.utxoCount++;
  }

  // Remove UTXO and update address balance
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
  }
}