import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { BitcoinNetworkReorganizedEvent, BlocksQueueService } from '@easylayer/bitcoin';

@Injectable()
@EventsHandler(BitcoinNetworkReorganizedEvent)
export class BitcoinNetworkReorganizedEventHandler implements IEventHandler<BitcoinNetworkReorganizedEvent> {
  constructor(private readonly blocksQueueService: BlocksQueueService) {}

  async handle(event: BitcoinNetworkReorganizedEvent) {
    await this.blocksQueueService.reorganizeBlocks(event.blockHeight);
  }
}
