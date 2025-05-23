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
          await this.blocksQueueService.start(payload.blockHeight);
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
