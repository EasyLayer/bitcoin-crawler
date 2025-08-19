import { BasicEvent, EventBasePayload } from '@easylayer/bitcoin-crawler';
import { BlockFeeData, MempoolFeeData, FeeRecommendations } from './utils';

// Event fired when a block's fee data has been analyzed
interface BlockFeeAnalyzedEventPayload extends EventBasePayload {
  timestamp: number;
  blockFeeData: BlockFeeData;
  activeFeatures: string[]; // Protocol features active at this block height
  blockHash: string;
}

export class BlockFeeAnalyzedEvent extends BasicEvent<BlockFeeAnalyzedEventPayload> {}

// Event fired when mempool has been analyzed
interface MempoolAnalyzedEventPayload extends EventBasePayload {
  timestamp: number;
  mempoolFeeData: MempoolFeeData;
  mempoolStats: {
    totalTxids: number;
    loadedTransactions: number;
    isSynchronized: boolean;
    fullSyncThreshold: number;
    currentBatchSize: number;
  };
}

export class MempoolAnalyzedEvent extends BasicEvent<MempoolAnalyzedEventPayload> {}

// Event fired when fee recommendations are updated
interface FeeRecommendationsUpdatedEventPayload extends EventBasePayload {
  timestamp: number;
  recommendations: FeeRecommendations;
}

export class FeeRecommendationsUpdatedEvent extends BasicEvent<FeeRecommendationsUpdatedEventPayload> {}

// Event fired when fee calculation configuration changes
interface FeeConfigurationChangedEventPayload extends EventBasePayload {
  historyDepth: number;
  analysisParameters: {
    mempoolAnalysisEnabled: boolean;
    historicalAnalysisEnabled: boolean;
    rbfAnalysisEnabled: boolean;
  };
}

export class FeeConfigurationChangedEvent extends BasicEvent<FeeConfigurationChangedEventPayload> {}