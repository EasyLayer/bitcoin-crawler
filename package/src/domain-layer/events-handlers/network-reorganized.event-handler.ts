import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { AppLogger } from '@easylayer/common/logger';
import { BitcoinNetworkReorganizedEvent } from '@easylayer/bitcoin';

@EventsHandler(BitcoinNetworkReorganizedEvent)
export class BitcoinNetworkReorganizedEventHandler implements IEventHandler<BitcoinNetworkReorganizedEvent> {
  constructor(private readonly log: AppLogger) {}

  async handle(event: BitcoinNetworkReorganizedEvent) {}
}
