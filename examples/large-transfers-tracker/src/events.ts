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

// Represents an aggregated large transfer for analysis
export type AggregatedTransfer = {
  txid: string;                    // Transaction ID
  blockHeight: number;             // Block height when transfer occurred
  timestamp: number;               // Unix timestamp of the block
  inputCount: number;              // Number of inputs in the transaction
  outputCount: number;             // Number of outputs in the transaction
  totalValue: string;              // Total transaction value in satoshi
  largeOutputs: {                  // Large outputs (>= threshold)
    address: string;               // Recipient address
    value: string;                 // Output value in satoshi
  }[];
  pattern: string;                 // Classified transfer pattern
  confidence: number;              // Pattern classification confidence (0-1)
  riskLevel: string;               // Risk level (LOW, MEDIUM, HIGH, CRITICAL)
};

interface TransferAggregationEventPayload extends EventBasePayload {
  timestamp: number;                    // Block timestamp
  outputs: AddressOutput[];             // New UTXOs created in this block
  inputs: AddressInput[];               // UTXOs spent in this block
  largeTransfers: AggregatedTransfer[]; // Large transfers detected in this block
}

export class TransferAggregationEvent extends BasicEvent<TransferAggregationEventPayload> {}