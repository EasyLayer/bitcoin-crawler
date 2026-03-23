// Browser-safe TransportConfig — no readFileSync/node:fs SSL helpers.
// Contains only fields relevant to browser client-side and SharedWorker transports.
import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, IsNumber, IsOptional, IsBoolean, IsIn } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';
import type { TransportKind } from '@easylayer/common/network-transport';

@Injectable()
export class TransportConfig {
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

  @Transform(({ value }) => {
    if (value === '' || value == null) return undefined;
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : undefined;
  })
  @IsNumber()
  @IsOptional()
  @JSONSchema({ description: 'HTTP request timeout in ms for browser webhook client' })
  TRANSPORT_HTTP_WEBHOOK_TIMEOUT_MS?: number;

  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Full WebSocket URL for the browser client (e.g., ws://localhost:3001)' })
  TRANSPORT_WS_BROWSER_URL?: string;

  @Transform(({ value }) =>
    value === 'true' || value === '1' || value === true
      ? '1'
      : value === 'false' || value === '0' || value === false
        ? '0'
        : undefined
  )
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Enable outbox-driven transport publishing: "1" or "0".' })
  TRANSPORT_OUTBOX_ENABLE?: string;

  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsIn(['http', 'ws', 'electron-ipc-renderer', 'shared-worker-server'], {
    message: 'TRANSPORT_OUTBOX_KIND must be one of: http, ws, electron-ipc-renderer, shared-worker-server',
  })
  @IsOptional()
  @JSONSchema({
    description: 'Outbox transport kind for browser/SharedWorker publishing',
    examples: ['http', 'ws', 'electron-ipc-renderer', 'shared-worker-server'],
  })
  TRANSPORT_OUTBOX_KIND?: TransportKind;

  @Transform(({ value }) => (value?.length ? value : undefined))
  @IsString()
  @IsOptional()
  @JSONSchema({ description: 'Optional password for SharedWorker pong verification' })
  TRANSPORT_SHARED_WORKER_PONG_PASSWORD?: string;

  // ── Config builders ───────────────────────────────────────────────────────

  getHTTPBrowserConfig() {
    if (!this.TRANSPORT_HTTP_WEBHOOK_URL) return undefined;
    return {
      type: 'http' as const,
      webhook: {
        url: this.TRANSPORT_HTTP_WEBHOOK_URL,
        pingUrl: this.TRANSPORT_HTTP_WEBHOOK_PING_URL,
        token: this.TRANSPORT_HTTP_WEBHOOK_TOKEN,
        timeoutMs: this.TRANSPORT_HTTP_WEBHOOK_TIMEOUT_MS,
      },
    };
  }

  getWSBrowserConfig() {
    if (!this.TRANSPORT_WS_BROWSER_URL) return undefined;
    return {
      type: 'ws' as const,
      url: this.TRANSPORT_WS_BROWSER_URL,
    };
  }

  getElectronIpcRendererConfig() {
    if (this.TRANSPORT_OUTBOX_KIND !== 'electron-ipc-renderer') return undefined;
    return { type: 'electron-ipc-renderer' as const };
  }

  getSharedWorkerServerConfig() {
    if (this.TRANSPORT_OUTBOX_KIND !== 'shared-worker-server') return undefined;
    return {
      type: 'shared-worker-server' as const,
      pongPassword: this.TRANSPORT_SHARED_WORKER_PONG_PASSWORD,
    };
  }

  getEnabledBrowserTransports() {
    const out: any[] = [];
    const http = this.getHTTPBrowserConfig();
    if (http) out.push(http);
    const ws = this.getWSBrowserConfig();
    if (ws) out.push(ws);
    const electron = this.getElectronIpcRendererConfig();
    if (electron) out.push(electron);
    const sw = this.getSharedWorkerServerConfig();
    if (sw) out.push(sw);
    return out;
  }

  getOutboxOptions(): { enabled: boolean; kind: TransportKind } | undefined {
    if (this.TRANSPORT_OUTBOX_ENABLE !== '1') return undefined;
    if (!this.TRANSPORT_OUTBOX_KIND) return undefined;
    return { enabled: true, kind: this.TRANSPORT_OUTBOX_KIND };
  }
}
