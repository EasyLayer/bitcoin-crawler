import { BasicEvent, EventBasePayload } from '@easylayer/bitcoin-crawler';

// Represents a transaction output (UTXO creation)
export type WatchedOutput = {
  address: string;  // Bitcoin address receiving funds
  txid: string;     // Transaction ID
  n: number;        // Output index in transaction
  value: string;    // Value in satoshi (as string for precision)
};

// Represents a transaction input (UTXO spending)
export type WatchedInput = {
  txid: string;     // Transaction ID of the UTXO being spent
  n: number;        // Output index of the UTXO being spent
};

// Event when watched addresses have balance changes
interface WatchedAddressActivityEventPayload extends EventBasePayload {
  outputs: WatchedOutput[];  // New UTXOs created for watched addresses
  inputs: WatchedInput[];    // UTXOs spent from watched addresses
}

export class WatchedAddressActivityEvent extends BasicEvent<WatchedAddressActivityEventPayload> {}
