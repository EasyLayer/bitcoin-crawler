import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNumber, IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

enum BlocksQueueStrategy {
  RPC_NETWORK_PROVIDER = 'rpc',
  P2P_NETWORK_PROVIDER = 'p2p',
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : undefined;
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

  @Transform(({ value }) => parseOptionalNumber(value))
  @IsOptional()
  @IsNumber()
  @JSONSchema({
    description:
      'Optional maximum predicted RPC raw-block reply size per loader request in bytes. When unset, AppModule keeps the legacy default: NETWORK_MAX_BLOCK_WEIGHT * 2.',
  })
  BLOCKS_QUEUE_LOADER_REQUEST_BLOCKS_BATCH_SIZE?: number;

  @Transform(({ value }) => parseOptionalNumber(value))
  @IsOptional()
  @IsNumber()
  @JSONSchema({
    description:
      'Optional maximum raw bytes to parse/process from queue in one iterator batch. When unset, AppModule keeps the legacy default: NETWORK_MAX_BLOCK_WEIGHT * 2.',
  })
  BLOCKS_QUEUE_ITERATOR_BLOCKS_BATCH_SIZE?: number;

  @Transform(({ value }) => value === 'true' || value === '1' || value === true)
  @IsBoolean()
  @JSONSchema({
    description:
      'Verify block Merkle roots while parsing raw blocks from BlocksQueue. Default false for throughput; enable for diagnostic/safety runs.',
    default: false,
  })
  BLOCKS_QUEUE_VERIFY_MERKLE_ROOT: boolean = false;
}
