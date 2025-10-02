import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, IsNumber, IsBoolean, IsOptional, IsIn } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

type NetworkType = 'mainnet' | 'testnet' | 'regtest' | 'signet';

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
  MAX_BLOCK_HEIGHT: number = Number.MAX_SAFE_INTEGER;

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
  START_BLOCK_HEIGHT?: number;

  @Transform(({ value }) => {
    const v = String(value ?? '').toLowerCase();
    return (['mainnet', 'testnet', 'regtest', 'signet'] as const).includes(v as any) ? (v as NetworkType) : 'mainnet';
  })
  @IsString()
  @IsIn(['mainnet', 'testnet', 'regtest', 'signet'])
  @JSONSchema({
    description: 'Bitcoin network type',
    enum: ['mainnet', 'testnet', 'regtest', 'signet'],
    default: 'mainnet',
  })
  NETWORK_TYPE: NetworkType = 'mainnet';

  @Transform(({ value }) => (value?.length ? value : 'BTC'))
  @IsString()
  @JSONSchema({
    description: 'Symbol of the native currency (BTC, LTC, DOGE, etc.)',
  })
  NETWORK_NATIVE_CURRENCY_SYMBOL: string = 'BTC';

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 8;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Decimals of the native currency',
  })
  NETWORK_NATIVE_CURRENCY_DECIMALS: number = 8;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 600000;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Target block time in milliseconds',
  })
  NETWORK_TARGET_BLOCK_TIME: number = 600000;

  @Transform(({ value }) => value !== 'false')
  @IsBoolean()
  @JSONSchema({
    description: 'Whether the network supports SegWit',
  })
  NETWORK_HAS_SEGWIT: boolean = true;

  @Transform(({ value }) => value !== 'false')
  @IsBoolean()
  @JSONSchema({
    description: 'Whether the network supports Taproot',
  })
  NETWORK_HAS_TAPROOT: boolean = true;

  @Transform(({ value }) => value !== 'false')
  @IsBoolean()
  @JSONSchema({
    description: 'Whether the network supports Replace-by-Fee',
  })
  NETWORK_HAS_RBF: boolean = true;

  @Transform(({ value }) => value !== 'false')
  @IsBoolean()
  @JSONSchema({
    description: 'Whether the network supports CheckSequenceVerify',
  })
  NETWORK_HAS_CSV: boolean = true;

  @Transform(({ value }) => value !== 'false')
  @IsBoolean()
  @JSONSchema({
    description: 'Whether the network supports CheckLockTimeVerify',
  })
  NETWORK_HAS_CLTV: boolean = true;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 1000000; // 1MB for Bitcoin base block size
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum block size in bytes (1MB for Bitcoin, 32MB for BCH)',
  })
  NETWORK_MAX_BLOCK_SIZE: number = 1000000;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 4000000; // 4MW for Bitcoin
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum block weight in weight units',
  })
  NETWORK_MAX_BLOCK_WEIGHT: number = 4000000;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 2016; // Bitcoin difficulty adjustment
  })
  @IsNumber()
  @JSONSchema({
    description: 'Difficulty adjustment interval in blocks',
  })
  NETWORK_DIFFICULTY_ADJUSTMENT_INTERVAL: number = 2016;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 1;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Minimum fee rate for caching transactions in sat/vB',
  })
  MEMPOOL_MIN_FEE_RATE: number = 1;

  /**
   * Returns normalized network configuration built from this config.
   */
  getNetworkConfig() {
    return {
      network: this.NETWORK_TYPE,
      nativeCurrencySymbol: this.NETWORK_NATIVE_CURRENCY_SYMBOL,
      nativeCurrencyDecimals: this.NETWORK_NATIVE_CURRENCY_DECIMALS,
      hasSegWit: this.NETWORK_HAS_SEGWIT,
      hasTaproot: this.NETWORK_HAS_TAPROOT,
      hasRBF: this.NETWORK_HAS_RBF,
      hasCSV: this.NETWORK_HAS_CSV,
      hasCLTV: this.NETWORK_HAS_CLTV,
      maxBlockSize: this.NETWORK_MAX_BLOCK_SIZE,
      maxBlockWeight: this.NETWORK_MAX_BLOCK_WEIGHT,
      difficultyAdjustmentInterval: this.NETWORK_DIFFICULTY_ADJUSTMENT_INTERVAL,
      targetBlockTime: this.NETWORK_TARGET_BLOCK_TIME,
    };
  }
}
