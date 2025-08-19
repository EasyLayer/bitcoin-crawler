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

// Represents a detected connection between addresses
export type AddressConnection = {
  fromAddress: string;       // Source address of the connection
  toAddress: string;         // Destination address of the connection
  txid: string;              // Transaction ID where connection was observed
  blockHeight: number;       // Block height when connection occurred
  amount: string;            // Amount transferred in satoshi
  connectionType: string;    // Type of connection (SMALL, MEDIUM, LARGE, etc.)
};

interface ClusterAnalysisEventPayload extends EventBasePayload {
  outputs: AddressOutput[];           // New UTXOs created in this block
  inputs: AddressInput[];             // UTXOs spent in this block
  connections: AddressConnection[];   // Address connections detected in this block
}

export class ClusterAnalysisEvent extends BasicEvent<ClusterAnalysisEventPayload> {}