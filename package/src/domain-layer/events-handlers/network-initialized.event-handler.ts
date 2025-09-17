import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { BitcoinNetworkInitializedEvent, BlocksQueueService } from '@easylayer/bitcoin';

@Injectable()
@EventsHandler(BitcoinNetworkInitializedEvent)
export class BitcoinNetworkInitializedEventHandler implements IEventHandler<BitcoinNetworkInitializedEvent> {
  constructor(private readonly blocksQueueService: BlocksQueueService) {}

  async handle(event: BitcoinNetworkInitializedEvent) {
    await this.blocksQueueService.start(event.blockHeight);
  }
}
