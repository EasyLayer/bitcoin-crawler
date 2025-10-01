import { Injectable } from '@nestjs/common';
import { EventStoreReadService } from '@easylayer/common/eventstore';
import { Network, LightBlock } from '@easylayer/bitcoin';
import { BlocksQueueConfig } from '../../config';

export const NETWORK_AGGREGATE_ID = 'network';

@Injectable()
export class NetworkModelFactoryService {
  constructor(
    private readonly eventStoreService: EventStoreReadService<Network>,
    private readonly blocksQueueConfig: BlocksQueueConfig
  ) {}

  public createNewModel(): Network {
    return new Network({
      maxSize: Math.max(this.blocksQueueConfig.BLOCKS_QUEUE_LOADER_PRELOADER_BASE_COUNT, 1000),
      aggregateId: NETWORK_AGGREGATE_ID,
      blockHeight: -1,
      options: {
        allowPruning: false,
        snapshotsEnabled: true,
        snapshotInterval: 25,
      },
    });
  }

  public async initModel(): Promise<Network> {
    const model = await this.eventStoreService.getOne(this.createNewModel());
    return model;
  }

  /**
   * Gets network chain statistics
   * Complexity: O(1)
   */
  public async getNetworkStats(): Promise<{
    isValid: boolean;
  }> {
    const model = await this.initModel();

    return {
      isValid: model.chain.validateChain(),
    };
  }

  /**
   * Gets a specific block by height
   * Complexity: O(n) where n = number of blocks in chain
   */
  public async getBlock(height: number): Promise<{
    block: LightBlock | null;
    exists: boolean;
  }> {
    const model = await this.initModel();
    const block = model.getBlockByHeight(height);

    return {
      block,
      exists: block !== null,
    };
  }

  /**
   * Gets multiple blocks (last N or all)
   * Complexity: O(n) where n = requested count or total blocks
   */
  public async getBlocks(
    lastN?: number,
    all: boolean = false
  ): Promise<{
    blocks: LightBlock[];
    requestedCount?: number;
  }> {
    const model = await this.initModel();
    let blocks: LightBlock[];
    let requestedCount: number | undefined;

    if (all) {
      blocks = model.getAllBlocks();
    } else if (lastN && lastN > 0) {
      blocks = model.getLastNBlocks(lastN);
      requestedCount = lastN;
    } else {
      // Default to last 10 blocks
      blocks = model.getLastNBlocks(10);
      requestedCount = 10;
    }

    return {
      blocks,
      requestedCount,
    };
  }

  /**
   * Gets the last (most recent) block
   * Complexity: O(1)
   */
  public async getLastBlock(): Promise<{
    lastBlock: LightBlock | undefined;
  }> {
    const model = await this.initModel();
    const lastBlock = model.getLastBlock();

    return {
      lastBlock,
    };
  }

  /**
   * Checks if a block exists at specific height
   * Complexity: O(n) where n = number of blocks in chain
   */
  public async hasBlockAtHeight(height: number): Promise<boolean> {
    const model = await this.initModel();
    return model.getBlockByHeight(height) !== null;
  }

  /**
   * Gets blocks in a height range
   * Complexity: O(n) where n = number of blocks in chain
   */
  public async getBlocksInRange(
    startHeight: number,
    endHeight: number
  ): Promise<{
    blocks: LightBlock[];
    found: number;
    requested: number;
  }> {
    const model = await this.initModel();
    const allBlocks = model.getAllBlocks();

    const blocksInRange = allBlocks.filter((block) => block.height >= startHeight && block.height <= endHeight);

    const requested = endHeight - startHeight + 1;

    return {
      blocks: blocksInRange,
      found: blocksInRange.length,
      requested,
    };
  }
}
