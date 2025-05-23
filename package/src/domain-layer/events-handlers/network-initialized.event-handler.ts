import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { AppLogger } from '@easylayer/common/logger';
import { BitcoinNetworkInitializedEvent } from '@easylayer/bitcoin';

@EventsHandler(BitcoinNetworkInitializedEvent)
export class BitcoinNetworkInitializedEventHandler implements IEventHandler<BitcoinNetworkInitializedEvent> {
  constructor(private readonly log: AppLogger) {}

  async handle(event: BitcoinNetworkInitializedEvent) {}
}
