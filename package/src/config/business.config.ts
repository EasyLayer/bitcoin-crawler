import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNumber, IsString } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

@Injectable()
export class BusinessConfig {
  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n === 0 ? 0 : n || Number.MAX_SAFE_INTEGER;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum block height to be processed. Defaults to infinity.',
    default: Number.MAX_SAFE_INTEGER,
  })
  BITCOIN_CRAWLER_MAX_BLOCK_HEIGHT: number = Number.MAX_SAFE_INTEGER;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n === 0 ? 0 : n || 0;
  })
  @IsNumber()
  @JSONSchema({
    description: 'The block height from which processing begins.',
    default: 0,
  })
  BITCOIN_CRAWLER_START_BLOCK_HEIGHT: number = 0;

  @Transform(({ value }) => (value?.length ? value : 'testnet'))
  @IsString()
  BITCOIN_CRAWLER_BLOCKCHAIN_NETWORK_NAME: string = 'testnet';

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n === 0 ? 0 : n || 1048576;
  })
  @IsNumber()
  @JSONSchema({
    description: 'The block size',
    default: 1048576,
  })
  BITCOIN_CRAWLER_ONE_BLOCK_SIZE: number = 1048576;
}
