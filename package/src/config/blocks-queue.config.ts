import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNumber, IsEnum } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

enum BlocksQueueStrategy {
  WEBHOOK_STREAM = 'webhook-stream',
  PULL_NETWORK_TRANSPORT = 'pull-network-transport',
  PULL_NETWORK_PROVIDER = 'pull-network-provider',
}

@Injectable()
export class BlocksQueueConfig {
  @Transform(({ value }) => (value?.length ? value : BlocksQueueStrategy.PULL_NETWORK_PROVIDER))
  @IsEnum(BlocksQueueStrategy)
  @JSONSchema({
    description: 'Loader strategy name for the Bitcoin blocks queue.',
    default: BlocksQueueStrategy.PULL_NETWORK_PROVIDER,
    enum: Object.values(BlocksQueueStrategy),
  })
  BITCOIN_CRAWLER_BLOCKS_QUEUE_LOADER_STRATEGY_NAME: BlocksQueueStrategy = BlocksQueueStrategy.PULL_NETWORK_PROVIDER;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n === 0 ? 0 : n || 4;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Concurrency сount of blocks download',
    default: 4,
  })
  BITCOIN_CRAWLER_BLOCKS_QUEUE_LOADER_CONCURRENCY_COUNT: number = 4;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n === 0 ? 0 : n || 1000;
  })
  @IsNumber()
  BITCOIN_CRAWLER_BLOCKS_QUEUE_LOADER_PRELOADER_BASE_COUNT: number = 1000;
}
