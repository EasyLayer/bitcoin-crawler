import { readFileSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, IsNumber, Min, Max, IsOptional, IsBoolean, IsArray } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

@Injectable()
export class AppConfig {
  @Transform(({ value }) => (value?.length ? value : 'development'))
  @IsString()
  @JSONSchema({ description: 'Node environment', default: 'development' })
  NODE_ENV: string = 'development';

  @Transform(({ value }) => (value?.length ? value : '0.0.0.0'))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Http Server host' })
  HTTP_HOST: string = '0.0.0.0';

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return isNaN(n) ? undefined : n;
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(65535)
  @JSONSchema({ description: 'Http Server port (0 or undefined to disable)', minimum: 0, maximum: 65535 })
  HTTP_PORT?: number;

  // HTTP SSL Configuration
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  @JSONSchema({ description: 'Enable SSL for HTTP server', default: false })
  HTTP_SSL_ENABLED: boolean = false;

  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Path to SSL private key file for HTTP server' })
  HTTP_SSL_KEY_PATH?: string;

  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Path to SSL certificate file for HTTP server' })
  HTTP_SSL_CERT_PATH?: string;

  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Path to SSL CA file for HTTP server' })
  HTTP_SSL_CA_PATH?: string;

  @Transform(({ value }) => (value?.length ? value : '0.0.0.0'))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'WebSocket server host', default: '0.0.0.0' })
  WS_HOST: string = '0.0.0.0';

  @Transform(({ value }) => (value?.length ? value : '/'))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'WebSocket Server path', default: '/' })
  WS_PATH: string = '/';

  @Transform(({ value }) => {
    const n = parseInt(value, 10);
    return isNaN(n) ? undefined : n;
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(65535)
  @JSONSchema({ description: 'WebSocket Server port (0 or undefined to disable)', minimum: 0, maximum: 65535 })
  WS_PORT?: number;

  @Transform(({ value }) => parseInt(value, 10) || 1024 * 1024)
  @IsNumber()
  @Min(1024)
  @JSONSchema({ description: 'Maximum message size for HTTP transport in bytes', default: 1048576 })
  HTTP_MAX_MESSAGE_SIZE: number = 1024 * 1024;

  @Transform(({ value }) => parseInt(value, 10) || 1024 * 1024)
  @IsNumber()
  @Min(1024)
  @JSONSchema({ description: 'Maximum message size for WebSocket transport in bytes', default: 1048576 })
  WS_MAX_MESSAGE_SIZE: number = 1024 * 1024;

  @Transform(({ value }) => parseInt(value, 10) || 1024 * 1024)
  @IsNumber()
  @Min(1024)
  @JSONSchema({ description: 'Maximum message size for IPC transport in bytes', default: 1048576 })
  IPC_MAX_MESSAGE_SIZE: number = 1024 * 1024;

  @Transform(({ value }) => parseInt(value, 10) || 3000)
  @IsNumber()
  @Min(100)
  @JSONSchema({ description: 'Heartbeat timeout in milliseconds', default: 3000 })
  HEARTBEAT_TIMEOUT: number = 3000;

  @Transform(({ value }) => parseInt(value, 10) || 2000)
  @IsNumber()
  @Min(100)
  @JSONSchema({ description: 'Connection timeout in milliseconds', default: 2000 })
  CONNECTION_TIMEOUT: number = 2000;

  @Transform(({ value }) => (value?.length ? value : '*'))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'CORS origin for WebSocket', default: '*' })
  WS_CORS_ORIGIN: string = '*';

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  @JSONSchema({ description: 'CORS credentials for WebSocket', default: false })
  WS_CORS_CREDENTIALS: boolean = false;

  // WebSocket SSL Configuration
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  @JSONSchema({ description: 'Enable SSL for WebSocket', default: false })
  WS_SSL_ENABLED: boolean = false;

  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Path to SSL private key file for WebSocket' })
  WS_SSL_KEY_PATH?: string;

  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Path to SSL certificate file for WebSocket' })
  WS_SSL_CERT_PATH?: string;

  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Path to SSL CA file for WebSocket' })
  WS_SSL_CA_PATH?: string;

  // WebSocket Transport Configuration
  @Transform(({ value }) => {
    if (!value?.length) return ['websocket', 'polling'];
    return value
      .split(',')
      .map((t: string) => t.trim())
      .filter((t: string) => ['websocket', 'polling'].includes(t));
  })
  @IsArray()
  @IsOptional()
  @JSONSchema({
    description: 'WebSocket transports (comma-separated: websocket,polling)',
    default: 'websocket,polling',
    examples: ['websocket,polling', 'websocket', 'polling'],
  })
  WS_TRANSPORTS: ('websocket' | 'polling')[] = ['websocket', 'polling'];

  isPRODUCTION(): boolean {
    return process?.env?.NODE_ENV === 'production';
  }

  isDEVELOPMENT(): boolean {
    return process?.env?.NODE_ENV === 'development';
  }

  isDEBUG(): boolean {
    return process?.env?.DEBUG === '1';
  }

  // Helper method to get HTTP transport configuration
  getHTTPTransportConfig() {
    return {
      type: 'http' as const,
      port: this.HTTP_PORT,
      host: this.HTTP_HOST,
      maxMessageSize: this.HTTP_MAX_MESSAGE_SIZE,
      connectionTimeout: this.CONNECTION_TIMEOUT,
      ssl: this.getHTTPSSLOptions(),
    };
  }

  // Helper method to get IPC transport configuration
  getIPCTransportConfig() {
    return {
      type: 'ipc' as const,
      maxMessageSize: this.IPC_MAX_MESSAGE_SIZE,
      heartbeatTimeout: this.HEARTBEAT_TIMEOUT,
      connectionTimeout: this.CONNECTION_TIMEOUT,
    };
  }

  // Helper method to get all enabled transports
  getEnabledTransports() {
    const transports: any[] = [];

    // HTTP Transport - enabled if HTTP_PORT is set and > 0
    if (this.HTTP_PORT && this.HTTP_PORT > 0) {
      transports.push(this.getHTTPTransportConfig());
    }

    // WebSocket Transport - enabled if WS_PORT is set and > 0
    if (this.WS_PORT && this.WS_PORT > 0) {
      transports.push(this.getWSTransportConfig());
    }

    // IPC Transport - enabled if running in child process with IPC
    if (process.send && process.connected) {
      transports.push(this.getIPCTransportConfig());
    }

    return transports;
  }

  // Helper method to get HTTP SSL options
  getHTTPSSLOptions() {
    if (!this.HTTP_SSL_ENABLED) {
      return { enabled: false };
    }

    try {
      return {
        enabled: true,
        key: this.HTTP_SSL_KEY_PATH ? readFileSync(this.HTTP_SSL_KEY_PATH, 'utf8') : undefined,
        cert: this.HTTP_SSL_CERT_PATH ? readFileSync(this.HTTP_SSL_CERT_PATH, 'utf8') : undefined,
        ca: this.HTTP_SSL_CA_PATH ? readFileSync(this.HTTP_SSL_CA_PATH, 'utf8') : undefined,
      };
    } catch (error) {
      return { enabled: false };
    }
  }

  // Helper method to get WebSocket SSL options
  getWSSSLOptions() {
    if (!this.WS_SSL_ENABLED) {
      return { enabled: false };
    }

    try {
      return {
        enabled: true,
        key: this.WS_SSL_KEY_PATH ? readFileSync(this.WS_SSL_KEY_PATH, 'utf8') : undefined,
        cert: this.WS_SSL_CERT_PATH ? readFileSync(this.WS_SSL_CERT_PATH, 'utf8') : undefined,
        ca: this.WS_SSL_CA_PATH ? readFileSync(this.WS_SSL_CA_PATH, 'utf8') : undefined,
      };
    } catch (error) {
      return { enabled: false };
    }
  }

  // Helper method to get WebSocket transport configuration
  getWSTransportConfig() {
    return {
      type: 'ws' as const,
      host: this.WS_HOST,
      port: this.WS_PORT,
      path: this.WS_PATH,
      maxMessageSize: this.WS_MAX_MESSAGE_SIZE,
      heartbeatTimeout: this.HEARTBEAT_TIMEOUT,
      connectionTimeout: this.CONNECTION_TIMEOUT,
      ssl: this.getWSSSLOptions(),
      cors: {
        origin: this.WS_CORS_ORIGIN,
        credentials: this.WS_CORS_CREDENTIALS,
      },
      transports: this.WS_TRANSPORTS,
    };
  }
}
