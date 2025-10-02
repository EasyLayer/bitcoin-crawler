import { v4 as uuidv4 } from 'uuid';
import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { BitcoinMempoolSynchronizedEvent } from '@easylayer/bitcoin';
import { NetworkCommandFactoryService } from '../../application-layer/services';

@Injectable()
@EventsHandler(BitcoinMempoolSynchronizedEvent)
export class BitcoinMempoolSynchronizedEventHandler implements IEventHandler<BitcoinMempoolSynchronizedEvent> {
  constructor(private readonly networkCommandFactory: NetworkCommandFactoryService) {}

  async handle(event: BitcoinMempoolSynchronizedEvent) {
    await this.networkCommandFactory.init({ requestId: uuidv4() });
  }
}
