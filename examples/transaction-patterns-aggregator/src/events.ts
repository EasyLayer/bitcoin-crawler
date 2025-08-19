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

// Represents a detected transaction pattern for analysis
export type TransactionPattern = {
  address: string;       // Bitcoin address involved in the transaction
  txid: string;          // Transaction ID
  blockHeight: number;   // Block height when transaction occurred
  timestamp: number;     // Unix timestamp of the block
  inputCount: number;    // Number of inputs in the transaction
  outputCount: number;   // Number of outputs in the transaction
  amounts: string[];     // Array of amounts involved (in satoshi)
  isChange: boolean;     // Whether this output is likely a change output
  isCoinJoin: boolean;   // Whether this transaction is likely a CoinJoin
};

interface PatternAnalysisEventPayload extends EventBasePayload {
  outputs: AddressOutput[];         // New UTXOs created in this block
  inputs: AddressInput[];           // UTXOs spent in this block
  patterns: TransactionPattern[];   // Detected transaction patterns in this block
}

export class PatternAnalysisEvent extends BasicEvent<PatternAnalysisEventPayload> {}