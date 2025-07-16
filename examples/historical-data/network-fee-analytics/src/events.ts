import { BasicEvent, EventBasePayload } from '@easylayer/bitcoin-crawler';
import { FeeData } from './utils';

interface BlockProcessedEventPayload extends EventBasePayload {
  timestamp: number;
  feeData: FeeData;
  blockVersion: number; // Track protocol version
  activatedFeatures: string[]; // Track what features were active at this block
}

export class BlockProcessedEvent extends BasicEvent<BlockProcessedEventPayload> {}