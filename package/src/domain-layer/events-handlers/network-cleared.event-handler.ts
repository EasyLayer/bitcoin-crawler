import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { BitcoinNetworkClearedEvent } from '@easylayer/bitcoin';
import { NetworkCommandFactoryService } from '../../application-layer/services';

@Injectable()
@EventsHandler(BitcoinNetworkClearedEvent)
export class BitcoinNetworkClearedEventHandler implements IEventHandler<BitcoinNetworkClearedEvent> {
  constructor(private readonly networkCommandFactory: NetworkCommandFactoryService) {}

  async handle(event: BitcoinNetworkClearedEvent) {
    await this.networkCommandFactory.init({ requestId: uuidv4() });
  }
}
