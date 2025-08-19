import { BasicEvent, EventBasePayload } from '@easylayer/bitcoin-crawler';

// Represents a transaction output (UTXO creation)
export type AddressOutput = {
  address: string;  // Bitcoin address receiving funds
  txid: string;     // Transaction ID
  n: number;        // Output index in transaction
  value: string;    // Value in satoshi (as string for precision)
};

// Represents a transaction input (UTXO spending)
export type AddressInput = {
  txid: string;     // Transaction ID of the UTXO being spent
  n: number;        // Output index of the UTXO being spent
};

interface PortfolioBalanceChangedEventPayload extends EventBasePayload {
  outputs: AddressOutput[];   // New UTXOs created in this block
  inputs: AddressInput[];     // UTXOs spent in this block
}

export class PortfolioBalanceChangedEvent extends BasicEvent<PortfolioBalanceChangedEventPayload> {}