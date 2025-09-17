import { performance } from 'node:perf_hooks';
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';

@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  log = new Logger(MetricsService.name);
  private readonly startTimes: Map<string, number> = new Map();
  private readonly totals: Map<string, number> = new Map();

  constructor() {}

  onModuleInit(): void {
    this.totals.set('app_time', 0);
    this.startMetric('app_time');
  }

  async onModuleDestroy(): Promise<void> {
    this.sumMetric('app_time');
    await this.logMetrics();
  }

  startMetric(key: string): void {
    this.startTimes.set(key, performance.now());
    if (!this.totals.has(key)) {
      this.totals.set(key, 0);
    }
  }

  sumMetric(key: string): void {
    const start = this.startTimes.get(key);
    if (start == null) {
      return;
    }
    const elapsed = performance.now() - start;
    const prev = this.totals.get(key) ?? 0;
    this.totals.set(key, prev + elapsed);
    this.startTimes.delete(key);
  }

  async track<T>(key: string, fn: () => Promise<T>): Promise<T> {
    this.startMetric(key);
    try {
      return await fn();
    } finally {
      this.sumMetric(key);
    }
  }

  getMetric(key: string): number {
    return this.totals.get(key) ?? 0;
  }

  getAllMetrics(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this.totals.entries()) {
      out[k] = v;
    }
    return out;
  }

  public async logMetrics(): Promise<void> {
    const all = this.getAllMetrics();
    this.log.log('=== Metrics Totals ===');
    for (const [k, v] of Object.entries(all)) {
      this.log.log(`  ${k}: ${v.toFixed(2)} ms`);
    }
    this.log.log('======================');
  }
}
