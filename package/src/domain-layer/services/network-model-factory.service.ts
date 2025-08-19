import { Injectable } from '@nestjs/common';
import { EventPublisher } from '@easylayer/common/cqrs';
import { EventStoreWriteRepository } from '@easylayer/common/eventstore';
import { Network, LightBlock } from '@easylayer/bitcoin';
import { BlocksQueueConfig } from '../../config';

export const NETWORK_AGGREGATE_ID = 'network';

@Injectable()
export class NetworkModelFactoryService {
  constructor(
    private readonly publisher: EventPublisher,
    private readonly networkWriteRepository: EventStoreWriteRepository<Network>,
    private readonly blocksQueueConfig: BlocksQueueConfig
  ) {}

  public createNewModel(): Network {
    return this.publisher.mergeObjectContext(
      new Network({
        maxSize: Math.max(this.blocksQueueConfig.BLOCKS_QUEUE_LOADER_PRELOADER_BASE_COUNT, 1000),
        aggregateId: NETWORK_AGGREGATE_ID,
        blockHeight: -1,
        options: {
          allowPruning: false,
          snapshotsEnabled: true,
          snapshotInterval: 25,
        },
      })
    );
  }

  public async initModel(): Promise<Network> {
    const model = await this.networkWriteRepository.getOne(this.createNewModel());
    return model;
  }

  /**
   * Gets network chain statistics
   * Complexity: O(1)
   */
  public async getNetworkStats(): Promise<{
    size: number;
    maxSize: number;
    currentHeight?: number;
    firstHeight?: number;
    isEmpty: boolean;
    isFull: boolean;
    isValid: boolean;
  }> {
    const model = await this.initModel();
    const stats = model.getChainStats();

    return {
      ...stats,
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
    chainStats: {
      currentHeight?: number;
      totalBlocks: number;
    };
  }> {
    const model = await this.initModel();
    const block = model.getBlockByHeight(height);
    const stats = model.getChainStats();

    return {
      block,
      exists: block !== null,
      chainStats: {
        currentHeight: stats.currentHeight,
        totalBlocks: stats.size,
      },
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
    totalCount: number;
    requestedCount?: number;
    chainStats: {
      currentHeight?: number;
      firstHeight?: number;
    };
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

    const stats = model.getChainStats();

    return {
      blocks,
      totalCount: stats.size,
      requestedCount,
      chainStats: {
        currentHeight: stats.currentHeight,
        firstHeight: stats.firstHeight,
      },
    };
  }

  /**
   * Gets the last (most recent) block
   * Complexity: O(1)
   */
  public async getLastBlock(): Promise<{
    lastBlock: LightBlock | undefined;
    hasBlocks: boolean;
    chainStats: {
      size: number;
      currentHeight?: number;
      isEmpty: boolean;
    };
  }> {
    const model = await this.initModel();
    const lastBlock = model.getLastBlock();
    const stats = model.getChainStats();

    return {
      lastBlock,
      hasBlocks: !stats.isEmpty,
      chainStats: {
        size: stats.size,
        currentHeight: stats.currentHeight,
        isEmpty: stats.isEmpty,
      },
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
