import { v4 as uuidv4 } from 'uuid';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { AppLogger } from '@easylayer/common/logger';
import { exponentialIntervalAsync, ExponentialTimer } from '@easylayer/common/exponential-interval-async';
import { MempoolCommandFactoryService } from './mempool-command-factory.service';

@Injectable()
export class MempoolSyncService implements OnModuleDestroy {
  private _isSyncing: boolean = false;
  private _timer: ExponentialTimer | null = null;

  constructor(
    private readonly log: AppLogger,
    private readonly mempoolCommandFactory: MempoolCommandFactoryService
  ) {}

  get isSyncing(): boolean {
    return this._isSyncing;
  }

  async onModuleDestroy() {
    this.log.debug('Mempool sync service is shutting down');
    this._timer?.destroy();
    this._timer = null;
    this._isSyncing = false;
  }

  public async startMempoolSync(hasMoreToProcess?: boolean): Promise<void> {
    this.log.info('Starting mempool sync');

    if (this._isSyncing) {
      this.log.debug('Mempool sync already running, restarting');
      this.stopMempoolSync();
    }

    this._isSyncing = true;

    this._timer = exponentialIntervalAsync(
      async (resetInterval) => {
        try {
          // Process one batch of mempool sync
          await this.mempoolCommandFactory.processSync({
            requestId: uuidv4(),
            hasMoreToProcess,
          });

          this.log.debug('Mempool sync batch completed, resetting interval');
          resetInterval();
        } catch (error) {
          this.log.debug('Mempool sync on pause, reason: ', {
            args: { error },
          });
          // Continue trying with exponential backoff
        }
      },
      {
        interval: 1000,
        maxInterval: 10000,
        multiplier: 1.5,
      }
    );

    this.log.debug('Mempool sync timer started');
  }

  public stopMempoolSync(): void {
    this.log.debug('Stopping mempool sync');
    this._timer?.destroy();
    this._timer = null;
    this._isSyncing = false;
  }
}
