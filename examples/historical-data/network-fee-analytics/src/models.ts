import { Model } from '@easylayer/bitcoin-crawler';
import { Block } from '@easylayer/bitcoin';
import {
  BlockProcessedEvent
} from './events';
import {
  analyzeBlockFees,
  calculateFeeRecommendations,
  getActiveFeatures,
  FeeData,
  FeeRecommendations
} from './utils';

export default class BitcoinFeeModel extends Model {
  private currentBlock: FeeData | null = null;
  private feeRecommendations: FeeRecommendations | null = null;

  constructor() {
    super('bitcoin-fee-analytics');
  }

  async parseBlock({ block }: { block: Block }) {
    const feeData = analyzeBlockFees(block);
    const activeFeatures = getActiveFeatures(block.height);

    await this.apply(new BlockProcessedEvent({
      aggregateId: this.aggregateId,
      requestId: `block-${block.height}-${Date.now()}`,
      blockHeight: block.height,
      timestamp: block.time,
      feeData,
      blockVersion: block.version || 1,
      activatedFeatures: activeFeatures
    }));
  }

  // Handler
  private onBlockProcessedEvent({ payload }: BlockProcessedEvent) {
    // Save current block fee data directly
    this.currentBlock = payload.feeData;

    // Calculate recommendations after each block
    this.updateRecommendations(payload.feeData);
  }

  private updateRecommendations(feeData: FeeData) {
    // Calculate recommendations based on current block
    this.feeRecommendations = calculateFeeRecommendations([feeData]);
  }
}