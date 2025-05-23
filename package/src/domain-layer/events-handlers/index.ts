import { BitcoinNetworkBlocksAddedEventHandler } from './blocks-added.event-handler';
import { BitcoinNetworkReorganizedEventHandler } from './network-reorganized.event-handler';
import { BitcoinNetworkInitializedEventHandler } from './network-initialized.event-handler';

export const EventsHandlers = [
  BitcoinNetworkBlocksAddedEventHandler,
  BitcoinNetworkReorganizedEventHandler,
  BitcoinNetworkInitializedEventHandler,
];
