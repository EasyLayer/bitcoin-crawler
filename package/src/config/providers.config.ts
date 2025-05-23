import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, IsOptional, IsArray, IsNumber } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

@Injectable()
export class ProvidersConfig {
  @Transform(({ value }) => (value?.length ? value : ''))
  @IsString()
  @IsOptional()
  @JSONSchema({
    description: "URL of the user's own Bitcoin node. Format: http://username:password@host:port",
  })
  BITCOIN_CRAWLER_NETWORK_PROVIDER_SELF_NODE_URL?: string;

  @Transform(({ value }) => (value?.length ? value.split('|') : []))
  @IsArray()
  @IsOptional()
  @JSONSchema({
    description: 'Multiple QuickNode node URLs can be entered, separated by commas.',
  })
  BITCOIN_CRAWLER_NETWORK_PROVIDER_QUICK_NODE_URLS?: string[];

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n === 0 ? 0 : n || 10000;
  })
  @IsNumber()
  BITCOIN_CRAWLER_NETWORK_PROVIDER_REQUEST_TIMEOUT: number = 10000;
}
