import { Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { BitcoinNetworkBlocksAddedEvent, BlocksQueueService } from '@easylayer/bitcoin';

@Injectable()
@EventsHandler(BitcoinNetworkBlocksAddedEvent)
export class BitcoinNetworkBlocksAddedEventHandler implements IEventHandler<BitcoinNetworkBlocksAddedEvent> {
  constructor(private readonly blocksQueueService: BlocksQueueService) {}

  async handle({ payload }: BitcoinNetworkBlocksAddedEvent) {
    await this.blocksQueueService.confirmProcessedBatch(payload.blocks.map((block: any) => block.hash));
  }
}
