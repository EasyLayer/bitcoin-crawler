import { v4 as uuidv4 } from 'uuid';
import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { BitcoinMempoolSyncProcessedEvent } from '@easylayer/bitcoin';
import { MempoolCommandFactoryService } from '../../application-layer/services';

@Injectable()
@EventsHandler(BitcoinMempoolSyncProcessedEvent)
export class BitcoinMempoolSyncProcessedEventHandler implements IEventHandler<BitcoinMempoolSyncProcessedEvent> {
  constructor(private readonly mempoolCommandFactory: MempoolCommandFactoryService) {}

  async handle({ payload }: BitcoinMempoolSyncProcessedEvent) {
    await this.mempoolCommandFactory.processSync({
      requestId: uuidv4(),
      hasMoreToProcess: payload.hasMoreToProcess,
    });
  }
}
