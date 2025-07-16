import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, IsNumber, IsBoolean, IsOptional } from 'class-validator';
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
    if (!value || value === '') return undefined;
    const n = parseInt(value, 10);
    return n === 0 ? 0 : n || undefined;
  })
  @IsOptional()
  @IsNumber()
  @JSONSchema({
    description: 'The block height from which processing begins. If not set, only listen to new blocks.',
    default: undefined,
  })
  BITCOIN_CRAWLER_START_BLOCK_HEIGHT?: number;

  @Transform(({ value }) => (value?.length ? value : 'mainnet'))
  @IsString()
  @JSONSchema({
    description: 'Bitcoin network type (mainnet, testnet, regtest, signet)',
  })
  BITCOIN_CRAWLER_NETWORK_TYPE: string = 'mainnet';

  @Transform(({ value }) => (value?.length ? value : 'BTC'))
  @IsString()
  @JSONSchema({
    description: 'Symbol of the native currency (BTC, LTC, DOGE, etc.)',
  })
  BITCOIN_CRAWLER_NETWORK_NATIVE_CURRENCY_SYMBOL: string = 'BTC';

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 8;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Decimals of the native currency',
  })
  BITCOIN_CRAWLER_NETWORK_NATIVE_CURRENCY_DECIMALS: number = 8;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 600; // 10 minutes for Bitcoin
  })
  @IsNumber()
  @JSONSchema({
    description: 'Target block time in seconds (600=Bitcoin, 150=Litecoin, 60=Dogecoin)',
  })
  BITCOIN_CRAWLER_NETWORK_TARGET_BLOCK_TIME: number = 600;

  @Transform(({ value }) => value !== 'false')
  @IsBoolean()
  @JSONSchema({
    description: 'Whether the network supports SegWit',
  })
  BITCOIN_CRAWLER_NETWORK_HAS_SEGWIT: boolean = true;

  @Transform(({ value }) => value !== 'false')
  @IsBoolean()
  @JSONSchema({
    description: 'Whether the network supports Taproot',
  })
  BITCOIN_CRAWLER_NETWORK_HAS_TAPROOT: boolean = true;

  @Transform(({ value }) => value !== 'false')
  @IsBoolean()
  @JSONSchema({
    description: 'Whether the network supports Replace-by-Fee',
  })
  BITCOIN_CRAWLER_NETWORK_HAS_RBF: boolean = true;

  @Transform(({ value }) => value !== 'false')
  @IsBoolean()
  @JSONSchema({
    description: 'Whether the network supports CheckSequenceVerify',
  })
  BITCOIN_CRAWLER_NETWORK_HAS_CSV: boolean = true;

  @Transform(({ value }) => value !== 'false')
  @IsBoolean()
  @JSONSchema({
    description: 'Whether the network supports CheckLockTimeVerify',
  })
  BITCOIN_CRAWLER_NETWORK_HAS_CLTV: boolean = true;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 1000000; // 1MB for Bitcoin base block size
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum block size in bytes (1MB for Bitcoin, 32MB for BCH)',
  })
  BITCOIN_CRAWLER_NETWORK_MAX_BLOCK_SIZE: number = 1000000;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 4000000; // 4MW for Bitcoin
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum block weight in weight units',
  })
  BITCOIN_CRAWLER_NETWORK_MAX_BLOCK_WEIGHT: number = 4000000;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 2016; // Bitcoin difficulty adjustment
  })
  @IsNumber()
  @JSONSchema({
    description: 'Difficulty adjustment interval in blocks',
  })
  BITCOIN_CRAWLER_NETWORK_DIFFICULTY_ADJUSTMENT_INTERVAL: number = 2016;
}
