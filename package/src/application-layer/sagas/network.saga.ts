// import { v4 as uuidv4 } from 'uuid';
import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Saga, ICommand, executeWithRetry } from '@easylayer/common/cqrs';
import {
  BlocksQueueService,
  BitcoinNetworkInitializedEvent,
  BitcoinNetworkBlocksAddedEvent,
  BitcoinNetworkReorganizedEvent,
} from '@easylayer/bitcoin';

@Injectable()
export class NetworkSaga {
  constructor(private readonly blocksQueueService: BlocksQueueService) {}

  @Saga()
  onBitcoinNetworkInitializedEvent(events$: Observable<any>): Observable<ICommand> {
    return events$.pipe(
      executeWithRetry({
        event: BitcoinNetworkInitializedEvent,
        command: async ({ payload }: BitcoinNetworkInitializedEvent) => {
          // eslint-disable-next-line no-console
          console.log('BEFORE');
          await this.blocksQueueService.start(payload.blockHeight);
          // eslint-disable-next-line no-console
          console.log('AFTER');
        },
      })
    );
  }

  @Saga()
  onBitcoinNetworkBlocksAddedEvent(events$: Observable<any>): Observable<ICommand> {
    return events$.pipe(
      executeWithRetry({
        event: BitcoinNetworkBlocksAddedEvent,
        command: async ({ payload }: BitcoinNetworkBlocksAddedEvent) => {
          await this.blocksQueueService.confirmProcessedBatch(payload.blocks.map((block: any) => block.hash));
        },
      })
    );
  }

  @Saga()
  onBitcoinNetworkReorganizedEvent(events$: Observable<any>): Observable<ICommand> {
    return events$.pipe(
      executeWithRetry({
        event: BitcoinNetworkReorganizedEvent,
        command: async ({ payload }: BitcoinNetworkReorganizedEvent) => {
          await this.blocksQueueService.reorganizeBlocks(payload.blockHeight);
        },
      })
    );
  }
}
