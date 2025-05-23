import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { AppLogger } from '@easylayer/common/logger';
import { BitcoinNetworkBlocksAddedEvent } from '@easylayer/bitcoin';

@EventsHandler(BitcoinNetworkBlocksAddedEvent)
export class BitcoinNetworkBlocksAddedEventHandler implements IEventHandler<BitcoinNetworkBlocksAddedEvent> {
  constructor(private readonly log: AppLogger) {}

  async handle(event: BitcoinNetworkBlocksAddedEvent) {}
}
