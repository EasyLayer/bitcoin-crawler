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

// Represents a detected flow path between addresses
export type FlowPath = {
  txid: string;          // Transaction ID where flow was detected
  blockHeight: number;   // Block height of the transaction
  fromAddress?: string;  // Source address (undefined for coinbase or unknown inputs)
  toAddress: string;     // Destination address
  amount: string;        // Amount transferred in satoshi
  confidence: number;    // Confidence score for this flow path (0-1)
};

interface FlowTrackingEventPayload extends EventBasePayload {
  outputs: AddressOutput[];   // New UTXOs created in this block
  inputs: AddressInput[];     // UTXOs spent in this block
  flows: FlowPath[];          // Detected flow paths in this block
}

export class FlowTrackingEvent extends BasicEvent<FlowTrackingEventPayload> {}