import { BitcoinNetworkBlocksAddedEventHandler } from './network-blocks-added.event-handler';
import { BitcoinNetworkReorganizedEventHandler } from './network-reorganized.event-handler';
import { BitcoinNetworkInitializedEventHandler } from './network-initialized.event-handler';
import { BitcoinMempoolSyncProcessedEventHandler } from './mempool-sync-processed.event-handler';
import { BitcoinMempoolInitializedEventHandler } from './mempool-initialized.event-handler';
import { BitcoinMempoolRefreshedEventHandler } from './mempool-refreshed.event-handler';
import { BitcoinNetworkClearedEventHandler } from './network-cleared.event-handler';
import { BitcoinMempoolSynchronizedEventHandler } from './mempool-synchronized.event-handler';

export const EventsHandlers = [
  BitcoinNetworkBlocksAddedEventHandler,
  BitcoinNetworkReorganizedEventHandler,
  BitcoinNetworkInitializedEventHandler,
  BitcoinMempoolSyncProcessedEventHandler,
  BitcoinMempoolInitializedEventHandler,
  BitcoinMempoolRefreshedEventHandler,
  BitcoinNetworkClearedEventHandler,
  BitcoinMempoolSynchronizedEventHandler,
];
