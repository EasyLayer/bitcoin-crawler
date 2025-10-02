import { v4 as uuidv4 } from 'uuid';
import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { BitcoinMempoolInitializedEvent } from '@easylayer/bitcoin';
import { MempoolCommandFactoryService } from '../../application-layer/services';

@Injectable()
@EventsHandler(BitcoinMempoolInitializedEvent)
export class BitcoinMempoolInitializedEventHandler implements IEventHandler<BitcoinMempoolInitializedEvent> {
  constructor(private readonly mempoolCommandFactory: MempoolCommandFactoryService) {}

  async handle(event: BitcoinMempoolInitializedEvent) {
    await this.mempoolCommandFactory.processSync({ requestId: uuidv4() });
  }
}
