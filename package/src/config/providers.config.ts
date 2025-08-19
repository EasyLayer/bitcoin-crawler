import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, IsNumber, IsOptional } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

type ProviderType = 'rpc' | 'p2p';

@Injectable()
export class ProvidersConfig {
  @Transform(({ value }) => (value ? value : 'rpc'))
  @IsString()
  @JSONSchema({
    description: 'Type of the network provider',
    enum: ['rpc', 'p2p'],
  })
  NETWORK_PROVIDER_TYPE: ProviderType = 'rpc';

  @Transform(({ value }) => 'rpc')
  @IsString()
  @JSONSchema({
    description: 'Type of the mempool provider - only RPC supported',
    enum: ['rpc'],
  })
  MEMPOOL_PROVIDER_TYPE: 'rpc' = 'rpc';

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n === 0 ? 0 : n || 5000;
  })
  @IsNumber()
  @JSONSchema({
    description: 'RPC request timeout in milliseconds for all providers',
  })
  PROVIDER_RPC_REQUEST_TIMEOUT: number = 5000;

  @Transform(({ value }) => {
    if (!value) return [];
    try {
      return value
        .split(',')
        .map((url: string) => url.trim())
        .filter((url: string) => url.length > 0);
    } catch (error) {
      throw new Error(`Failed to parse PROVIDER_NETWORK_RPC_URLS: ${(error as any)?.message}`);
    }
  })
  @IsOptional()
  @JSONSchema({
    description: 'Network RPC URLs as comma-separated list',
  })
  PROVIDER_NETWORK_RPC_URLS?: string[];

  @Transform(({ value }) => (value ? value : ''))
  @IsString()
  @IsOptional()
  @JSONSchema({
    description: 'Network ZMQ endpoint for real-time notifications',
  })
  PROVIDER_NETWORK_ZMQ_ENDPOINT?: string;

  @Transform(({ value }) => {
    if (!value) return [];
    try {
      return value
        .split(',')
        .map((url: string) => url.trim())
        .filter((url: string) => url.length > 0);
    } catch (error) {
      throw new Error(`Failed to parse PROVIDER_MEMPOOL_RPC_URLS: ${(error as any)?.message}`);
    }
  })
  @IsOptional()
  @JSONSchema({
    description: 'Mempool RPC URLs as comma-separated list',
  })
  PROVIDER_MEMPOOL_RPC_URLS?: string[];

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 30000;
  })
  @IsNumber()
  @JSONSchema({
    description: 'P2P connection timeout in milliseconds for network provider',
  })
  PROVIDER_P2P_CONNECTION_TIMEOUT: number = 30000;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 1;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum number of P2P peers to connect for network provider',
  })
  PROVIDER_P2P_MAX_PEERS: number = 1;

  @Transform(({ value }) => {
    if (!value) return [];
    try {
      return value.split(',').map((peer: string) => {
        const [host, port] = peer.trim().split(':');
        if (!host || !port) {
          throw new Error(`Invalid peer format: ${peer}. Expected format: host:port`);
        }
        return {
          host: host.trim(),
          port: parseInt(port.trim(), 10),
        };
      });
    } catch (error) {
      throw new Error(`Failed to parse PROVIDER_NETWORK_P2P_PEERS: ${(error as any)?.message}`);
    }
  })
  @IsOptional()
  @JSONSchema({
    description: 'Network P2P peers as comma-separated host:port pairs',
  })
  PROVIDER_NETWORK_P2P_PEERS?: Array<{ host: string; port: number }>;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 2000;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum blocks batch size for network P2P requests',
  })
  PROVIDER_NETWORK_P2P_MAX_BLOCKS_BATCH_SIZE: number = 2000;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 1000;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum batch size for requests for all providers',
  })
  PROVIDER_RATE_LIMIT_MAX_BATCH_SIZE: number = 1000;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 1;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Maximum concurrent requests for providers',
  })
  PROVIDER_RATE_LIMIT_MAX_CONCURRENT_REQUESTS: number = 1;

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return n || 1000;
  })
  @IsNumber()
  @JSONSchema({
    description: 'Delay between batches in milliseconds for providers',
  })
  PROVIDER_RATE_LIMIT_REQUEST_DELAY_MS: number = 1000;

  // ========== VALIDATION HELPERS ==========

  // validateNetwork(): void {
  //   if (this.NETWORK_PROVIDER_TYPE === 'RPC') {
  //     if (!this.PROVIDER_NETWORK_RPC_URLS || this.PROVIDER_NETWORK_RPC_URLS.length === 0) {
  //       throw new Error('PROVIDER_NETWORK_RPC_URLS is required when using RPC network provider type');
  //     }
  //   } else if (this.NETWORK_PROVIDER_TYPE === 'P2P') {
  //     if (!this.PROVIDER_NETWORK_P2P_PEERS || this.PROVIDER_NETWORK_P2P_PEERS.length === 0) {
  //       throw new Error('PROVIDER_NETWORK_P2P_PEERS is required when using P2P network provider type');
  //     }
  //   }
  // }

  // validateMempool(): void {
  //   if (!this.PROVIDER_MEMPOOL_RPC_URLS || this.PROVIDER_MEMPOOL_RPC_URLS.length === 0) {
  //     throw new Error('PROVIDER_MEMPOOL_RPC_URLS is required for mempool provider');
  //   }
  // }
}
