import { BasicEvent, EventBasePayload } from '@easylayer/bitcoin-crawler';

type TxId = string;
type N = string;
type OutputKey = `${TxId}_${N}`;
type Value = string;
export type Outputs = Map<OutputKey, Value>;
// export type Output = {
//     txid: string;           // block.tx[].txid
//     n: number;              // block.tx[].vout[].n
//     value: string;
// }
export type Input = {
  txid: string;          // block.tx[].txid
  outputTxid: string;    // block.tx[].vin[].txid
  outputN: number;       // block.tx[].vin[].vout
}

interface BlockAddedEventPayload extends EventBasePayload {
  inputs: Input[],
  outputs: Outputs
}

export class BlockAddedEvent extends BasicEvent<BlockAddedEventPayload> {}
