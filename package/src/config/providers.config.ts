import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, IsNumber } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

@Injectable()
export class ProvidersConfig {
  @Transform(({ value }) => (value ? value : ''))
  @IsString()
  @JSONSchema({
    description: 'HTTP URL of the Bitcoin-like network provider node',
  })
  BITCOIN_CRAWLER_NETWORK_PROVIDER_NODE_HTTP_URL!: string;

  @Transform(({ value }) => (value ? value : 'selfnode'))
  @IsString()
  @JSONSchema({
    description: 'Type of the network provider (selfnode, quicknode, etc.)',
  })
  BITCOIN_CRAWLER_NETWORK_PROVIDER_TYPE: string = 'selfnode';

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n === 0 ? 0 : n || 5000;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Request timeout in milliseconds',
  })
  BITCOIN_CRAWLER_NETWORK_PROVIDER_REQUEST_TIMEOUT: number = 5000;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 8;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum concurrent requests',
  })
  BITCOIN_CRAWLER_NETWORK_PROVIDER_RATE_LIMIT_MAX_CONCURRENT_REQUESTS: number = 1;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 15;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum batch size for parallel requests',
  })
  BITCOIN_CRAWLER_NETWORK_PROVIDER_RATE_LIMIT_MAX_BATCH_SIZE: number = 1000;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 100;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Delay between batches in milliseconds',
  })
  BITCOIN_CRAWLER_NETWORK_PROVIDER_RATE_LIMIT_REQUEST_DELAY_MS: number = 100;
}
