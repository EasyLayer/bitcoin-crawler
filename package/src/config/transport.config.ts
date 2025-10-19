import { readFileSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, IsNumber, Min, Max, IsOptional, IsBoolean, IsArray, IsIn } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';
import type { TransportKind } from '@easylayer/common/network-transport';

type IpcKind = 'ipc-child' | 'ipc-parent';

@Injectable()
export class TransportConfig {
  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'HTTP server host (if omitted, HTTP is disabled)' })
  TRANSPORT_HTTP_HOST?: string;

  @Transform(({ value }) => {
    if (value === '' || value == null) return undefined;
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : undefined;
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(65535)
  @JSONSchema({
    description: 'HTTP server port. If undefined or 0, HTTP transport is disabled.',
    minimum: 0,
    maximum: 65535,
  })
  TRANSPORT_HTTP_PORT?: number;

  @Transform(({ value }) => {
    if (value === '' || value == null) return undefined;
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : undefined;
  })
  @IsNumber()
  @IsOptional()
  @Min(1024)
  @JSONSchema({
    description: 'Maximum HTTP message/frame size in bytes. If undefined, use app default.',
  })
  TRANSPORT_HTTP_MAX_MESSAGE_SIZE?: number;

  // HTTP SSL
  @Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' ? false : undefined))
  @IsBoolean()
  @IsOptional()
  @JSONSchema({
    description: 'Enable TLS for HTTP server. If undefined, treated as disabled.',
  })
  TRANSPORT_HTTP_SSL_ENABLED?: boolean;

  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Path to HTTP TLS private key (PEM)' })
  TRANSPORT_HTTP_SSL_KEY_PATH?: string;

  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Path to HTTP TLS certificate (PEM)' })
  TRANSPORT_HTTP_SSL_CERT_PATH?: string;

  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Path to HTTP TLS CA bundle (PEM)' })
  TRANSPORT_HTTP_SSL_CA_PATH?: string;

  // HTTP Webhook (optional outbound publishing)
  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'HTTP webhook URL for outbound event batches' })
  TRANSPORT_HTTP_WEBHOOK_URL?: string;

  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Optional healthcheck/ping URL for webhook' })
  TRANSPORT_HTTP_WEBHOOK_PING_URL?: string;

  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Optional bearer/shared token for webhook auth' })
  TRANSPORT_HTTP_WEBHOOK_TOKEN?: string;

  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsString()
  @IsOptional()
  @JSONSchema({
    description: 'WebSocket server host (if omitted, WS is disabled)',
  })
  TRANSPORT_WS_HOST?: string;

  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'WebSocket server path (e.g., "/socket")' })
  TRANSPORT_WS_PATH?: string;

  @Transform(({ value }) => {
    if (value === '' || value == null) return undefined;
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : undefined;
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(65535)
  @JSONSchema({
    description: 'WebSocket server port. If undefined or 0, WS transport is disabled.',
    minimum: 0,
    maximum: 65535,
  })
  TRANSPORT_WS_PORT?: number;

  @Transform(({ value }) => {
    if (value === '' || value == null) return undefined;
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : undefined;
  })
  @IsNumber()
  @IsOptional()
  @Min(1024)
  @JSONSchema({
    description: 'Maximum WebSocket message/frame size in bytes. If undefined, use app default.',
  })
  TRANSPORT_WS_MAX_MESSAGE_SIZE?: number;

  // WS CORS
  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsString()
  @IsOptional()
  @JSONSchema({
    description: 'CORS origin for WS server (string value). If undefined, CORS is not applied.',
    examples: ['*', 'https://example.com'],
  })
  TRANSPORT_WS_CORS_ORIGIN?: string;

  @Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' ? false : undefined))
  @IsBoolean()
  @IsOptional()
  @JSONSchema({ description: 'CORS credentials for WS server' })
  TRANSPORT_WS_CORS_CREDENTIALS?: boolean;

  // WS SSL
  @Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' ? false : undefined))
  @IsBoolean()
  @IsOptional()
  @JSONSchema({
    description: 'Enable TLS for WebSocket server. If undefined, treated as disabled.',
  })
  TRANSPORT_WS_SSL_ENABLED?: boolean;

  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Path to WS TLS private key (PEM)' })
  TRANSPORT_WS_SSL_KEY_PATH?: string;

  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Path to WS TLS certificate (PEM)' })
  TRANSPORT_WS_SSL_CERT_PATH?: string;

  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Path to WS TLS CA bundle (PEM)' })
  TRANSPORT_WS_SSL_CA_PATH?: string;

  // WS transport kinds
  @Transform(({ value }) => {
    if (!value?.length) return undefined;
    const arr = String(value)
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t === 'websocket' || t === 'polling');
    return arr.length ? arr : undefined;
  })
  @IsArray()
  @IsOptional()
  @JSONSchema({
    description: 'Enabled WS transport modes (comma-separated). If undefined, library defaults apply.',
    examples: ['websocket,polling', 'websocket', 'polling'],
  })
  TRANSPORT_WS_TRANSPORTS?: string[];

  // ───────────────────────────── IPC ─────────────────────────────

  @Transform(({ value }) => {
    if (value === '' || value == null) return undefined;
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : undefined;
  })
  @IsNumber()
  @IsOptional()
  @Min(1024)
  @JSONSchema({
    description: 'Maximum IPC message size in bytes. If undefined, use app default.',
  })
  TRANSPORT_IPC_MAX_MESSAGE_SIZE?: number;

  @Transform(({ value }) => {
    if (value === '' || value == null) return undefined;
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : undefined;
  })
  @IsNumber()
  @IsOptional()
  @Min(100)
  @JSONSchema({
    description: 'Heartbeat timeout in milliseconds for streaming transports. If undefined, use app default.',
  })
  TRANSPORT_HEARTBEAT_TIMEOUT?: number;

  @Transform(({ value }) => {
    if (value === '' || value == null) return undefined;
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : undefined;
  })
  @IsNumber()
  @IsOptional()
  @Min(100)
  @JSONSchema({
    description: 'Connection timeout in milliseconds. If undefined, use app default.',
  })
  TRANSPORT_CONNECTION_TIMEOUT?: number;

  @Transform(({ value }) =>
    value === 'true' || value === '1' || value === true
      ? '1'
      : value === 'false' || value === '0' || value === false
        ? '0'
        : undefined
  )
  @IsString()
  @IsOptional()
  @JSONSchema({
    description: 'Enable outbox-driven transport publishing: "1" or "0". If undefined, feature is off by default.',
    examples: ['1', '0'],
  })
  TRANSPORT_OUTBOX_ENABLE?: string; // '1' | '0'

  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsIn(['http', 'ws', 'ipc-parent', 'ipc-child', 'electron-ipc-main', 'electron-ipc-renderer'], {
    message:
      'TRANSPORT_OUTBOX_KIND must be one of: http, ws, ipc-parent, ipc-child, electron-ipc-main, electron-ipc-renderer',
  })
  @IsOptional()
  @JSONSchema({
    description: 'Outbox transport kind for publishing batches',
    examples: ['http', 'ws', 'ipc-parent', 'ipc-child', 'electron-ipc-main', 'electron-ipc-renderer'],
  })
  TRANSPORT_OUTBOX_KIND?: TransportKind;

  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsIn(['ipc-parent', 'ipc-child'], {
    message: 'TRANSPORT_IPC_TYPE must be one of: ipc-parent, ipc-child',
  })
  @IsOptional()
  @JSONSchema({
    description: 'IPC transport kind for enable transport',
    examples: ['ipc-parent', 'ipc-child'],
  })
  TRANSPORT_IPC_TYPE?: IpcKind;

  getHTTPSSLOptions() {
    if (!this.TRANSPORT_HTTP_SSL_ENABLED) return { enabled: false };
    try {
      return {
        enabled: true,
        key: this.TRANSPORT_HTTP_SSL_KEY_PATH ? readFileSync(this.TRANSPORT_HTTP_SSL_KEY_PATH, 'utf8') : undefined,
        cert: this.TRANSPORT_HTTP_SSL_CERT_PATH ? readFileSync(this.TRANSPORT_HTTP_SSL_CERT_PATH, 'utf8') : undefined,
        ca: this.TRANSPORT_HTTP_SSL_CA_PATH ? readFileSync(this.TRANSPORT_HTTP_SSL_CA_PATH, 'utf8') : undefined,
      };
    } catch {
      return { enabled: false };
    }
  }

  getWSSSLOptions() {
    if (!this.TRANSPORT_WS_SSL_ENABLED) return { enabled: false };
    try {
      return {
        enabled: true,
        key: this.TRANSPORT_WS_SSL_KEY_PATH ? readFileSync(this.TRANSPORT_WS_SSL_KEY_PATH, 'utf8') : undefined,
        cert: this.TRANSPORT_WS_SSL_CERT_PATH ? readFileSync(this.TRANSPORT_WS_SSL_CERT_PATH, 'utf8') : undefined,
        ca: this.TRANSPORT_WS_SSL_CA_PATH ? readFileSync(this.TRANSPORT_WS_SSL_CA_PATH, 'utf8') : undefined,
      };
    } catch {
      return { enabled: false };
    }
  }

  getHTTPTransportConfig() {
    // enable only if port > 0
    if (!this.TRANSPORT_HTTP_PORT || this.TRANSPORT_HTTP_PORT <= 0) return undefined;

    const webhook = this.TRANSPORT_HTTP_WEBHOOK_URL
      ? {
          url: this.TRANSPORT_HTTP_WEBHOOK_URL,
          token: this.TRANSPORT_HTTP_WEBHOOK_TOKEN || undefined,
          pingUrl: this.TRANSPORT_HTTP_WEBHOOK_PING_URL || undefined,
        }
      : undefined;

    return {
      type: 'http' as const,
      host: this.TRANSPORT_HTTP_HOST,
      port: this.TRANSPORT_HTTP_PORT,
      maxMessageSize: this.TRANSPORT_HTTP_MAX_MESSAGE_SIZE,
      connectionTimeout: this.TRANSPORT_CONNECTION_TIMEOUT,
      ssl: this.getHTTPSSLOptions(),
      webhook,
    };
  }

  getWSTransportConfig() {
    // enable only if port > 0
    if (!this.TRANSPORT_WS_PORT || this.TRANSPORT_WS_PORT <= 0) return undefined;

    return {
      type: 'ws' as const,
      host: this.TRANSPORT_WS_HOST,
      port: this.TRANSPORT_WS_PORT,
      path: this.TRANSPORT_WS_PATH,
      maxMessageSize: this.TRANSPORT_WS_MAX_MESSAGE_SIZE,
      heartbeatTimeout: this.TRANSPORT_HEARTBEAT_TIMEOUT,
      connectionTimeout: this.TRANSPORT_CONNECTION_TIMEOUT,
      ssl: this.getWSSSLOptions(),
      cors: {
        origin: this.TRANSPORT_WS_CORS_ORIGIN,
        credentials: this.TRANSPORT_WS_CORS_CREDENTIALS ?? false, // undefined → false by default in server
      },
      transports: this.TRANSPORT_WS_TRANSPORTS, // undefined → library default resolution
    };
  }

  getIpcChildTransportConfig() {
    if (this.TRANSPORT_OUTBOX_KIND !== 'ipc-child' && this.TRANSPORT_IPC_TYPE !== 'ipc-child') return undefined;

    const p: any = process;
    if (!p?.send || !p?.connected || !p?.channel) {
      return undefined;
    }

    return {
      type: 'ipc-child' as const,
      maxMessageSize: this.TRANSPORT_IPC_MAX_MESSAGE_SIZE,
      heartbeatTimeout: this.TRANSPORT_HEARTBEAT_TIMEOUT,
      connectionTimeout: this.TRANSPORT_CONNECTION_TIMEOUT,
    };
  }

  getIpcParentTransportConfig() {
    if (this.TRANSPORT_OUTBOX_KIND !== 'ipc-parent' && this.TRANSPORT_IPC_TYPE !== 'ipc-parent') return undefined;

    const p: any = process;
    if (p?.send && p?.channel) {
      return undefined;
    }

    return {
      type: 'ipc-parent' as const,
      maxMessageSize: this.TRANSPORT_IPC_MAX_MESSAGE_SIZE,
      heartbeatTimeout: this.TRANSPORT_HEARTBEAT_TIMEOUT,
      connectionTimeout: this.TRANSPORT_CONNECTION_TIMEOUT,
    };
  }

  /** Returns only the transports explicitly enabled by config/runtime. */
  getEnabledTransports() {
    const out: any[] = [];

    const http = this.getHTTPTransportConfig();
    if (http) out.push(http);

    const ws = this.getWSTransportConfig();
    if (ws) out.push(ws);

    const ipcChild = this.getIpcChildTransportConfig();
    if (ipcChild) out.push(ipcChild);

    const ipcParent = this.getIpcParentTransportConfig();
    if (ipcParent) out.push(ipcParent);

    return out;
  }

  getOutboxOptions(): { enabled: boolean; kind: TransportKind } | undefined {
    if (this.TRANSPORT_OUTBOX_ENABLE !== '1') return undefined;
    if (!this.TRANSPORT_OUTBOX_KIND) return undefined;
    return { enabled: true, kind: this.TRANSPORT_OUTBOX_KIND };
  }
}
