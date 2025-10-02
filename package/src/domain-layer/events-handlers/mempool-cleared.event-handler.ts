import { v4 as uuidv4 } from 'uuid';
import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { BitcoinMempoolClearedEvent } from '@easylayer/bitcoin';
import { MempoolCommandFactoryService } from '../../application-layer/services';

@Injectable()
@EventsHandler(BitcoinMempoolClearedEvent)
export class BitcoinMempoolClearedEventHandler implements IEventHandler<BitcoinMempoolClearedEvent> {
  constructor(private readonly mempoolCommandFactory: MempoolCommandFactoryService) {}

  async handle(event: BitcoinMempoolClearedEvent) {
    await this.mempoolCommandFactory.init({ requestId: uuidv4() });
  }
}
