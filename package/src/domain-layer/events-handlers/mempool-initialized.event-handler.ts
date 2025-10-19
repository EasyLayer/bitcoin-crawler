import { v4 as uuidv4 } from 'uuid';
import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { BitcoinMempoolInitializedEvent, MempoolLoaderService } from '@easylayer/bitcoin';
import { NetworkCommandFactoryService } from '../../application-layer/services';

@Injectable()
@EventsHandler(BitcoinMempoolInitializedEvent)
export class BitcoinMempoolInitializedEventHandler implements IEventHandler<BitcoinMempoolInitializedEvent> {
  constructor(
    private readonly mempoolLoaderService: MempoolLoaderService,
    private readonly networkCommandFactory: NetworkCommandFactoryService
  ) {}

  async handle(event: BitcoinMempoolInitializedEvent) {
    this.mempoolLoaderService.start();
    await this.networkCommandFactory.init({ requestId: uuidv4() });
  }
}
