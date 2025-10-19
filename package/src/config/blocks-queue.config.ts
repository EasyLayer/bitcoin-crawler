import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNumber, IsEnum } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

enum BlocksQueueStrategy {
  RPC_NETWORK_PROVIDER = 'rpc',
  P2P_NETWORK_PROVIDER = 'p2p',
}

@Injectable()
export class BlocksQueueConfig {
  @Transform(({ value }) => (value?.length ? value : BlocksQueueStrategy.RPC_NETWORK_PROVIDER))
  @IsEnum(BlocksQueueStrategy)
  @JSONSchema({
    description: 'Loader strategy name for the Bitcoin blocks queue.',
    default: BlocksQueueStrategy.RPC_NETWORK_PROVIDER,
    enum: Object.values(BlocksQueueStrategy),
  })
  BLOCKS_QUEUE_LOADER_STRATEGY_NAME: BlocksQueueStrategy = BlocksQueueStrategy.RPC_NETWORK_PROVIDER;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n === 0 ? 0 : n || 1;
  })
  @IsNumber()
  BLOCKS_QUEUE_LOADER_PRELOADER_BASE_COUNT: number = 1;
}
