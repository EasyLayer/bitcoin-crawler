import { v4 as uuidv4 } from 'uuid';
import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Saga, ICommand, executeWithRetry } from '@easylayer/common/cqrs';
import { AppLogger } from '@easylayer/common/logger';
import {
  BitcoinNetworkBlocksAddedEvent,
  BitcoinNetworkReorganizedEvent,
  BitcoinMempoolInitializedEvent,
  BitcoinMempoolSyncProcessedEvent,
  BitcoinMempoolClearedEvent,
} from '@easylayer/bitcoin';
import { MempoolCommandFactoryService } from '../services';
import { ProvidersConfig } from '../../config';

@Injectable()
export class MempoolSaga {
  constructor(
    private readonly log: AppLogger,
    private readonly mempoolCommandFactory: MempoolCommandFactoryService,
    private readonly providersConfig: ProvidersConfig
  ) {}

  @Saga()
  onBitcoinMempoolClearedEvent(events$: Observable<any>): Observable<ICommand> {
    return events$.pipe(
      executeWithRetry({
        event: BitcoinMempoolClearedEvent,
        command: async ({ payload }: BitcoinMempoolClearedEvent) => {
          await this.mempoolCommandFactory.init({
            requestId: uuidv4(),
          });
        },
      })
    );
  }

  @Saga()
  onBitcoinMempoolInitializedEvent(events$: Observable<any>): Observable<ICommand> {
    return events$.pipe(
      executeWithRetry({
        event: BitcoinMempoolInitializedEvent,
        command: async ({ payload }: BitcoinMempoolInitializedEvent) => {
          await this.mempoolCommandFactory.processSync({
            requestId: uuidv4(),
          });
        },
      })
    );
  }

  @Saga()
  onBitcoinMempoolSyncProcessedEvent(events$: Observable<any>): Observable<ICommand> {
    return events$.pipe(
      executeWithRetry({
        event: BitcoinMempoolSyncProcessedEvent,
        command: async ({ payload }: BitcoinMempoolSyncProcessedEvent) => {
          await this.mempoolCommandFactory.processSync({
            requestId: uuidv4(),
            hasMoreToProcess: payload.hasMoreToProcess,
          });
        },
      })
    );
  }

  // on Network events

  @Saga()
  onBitcoinNetworkBlocksAdded(events$: Observable<any>): Observable<ICommand> {
    return events$.pipe(
      executeWithRetry({
        event: BitcoinNetworkBlocksAddedEvent,
        command: async ({ payload }: BitcoinNetworkBlocksAddedEvent) => {
          if (
            Array.isArray(this.providersConfig.PROVIDER_MEMPOOL_RPC_URLS) &&
            this.providersConfig.PROVIDER_MEMPOOL_RPC_URLS.length > 0
          ) {
            await this.mempoolCommandFactory.processBlocksBatch({
              requestId: uuidv4(),
              blocks: payload.blocks,
            });
          }
        },
      })
    );
  }

  @Saga()
  onBitcoinNetworkReorganized(events$: Observable<any>): Observable<ICommand> {
    return events$.pipe(
      executeWithRetry({
        event: BitcoinNetworkReorganizedEvent,
        command: async ({ payload }: BitcoinNetworkReorganizedEvent) => {
          if (
            Array.isArray(this.providersConfig.PROVIDER_MEMPOOL_RPC_URLS) &&
            this.providersConfig.PROVIDER_MEMPOOL_RPC_URLS.length > 0
          ) {
            await this.mempoolCommandFactory.processReorganisation({
              requestId: uuidv4(),
              blocks: payload.blocks,
            });
          }
        },
      })
    );
  }
}
