import { v4 as uuidv4 } from 'uuid';
import { EventsHandler, IEventHandler } from '@easylayer/common/cqrs';
import { AppLogger } from '@easylayer/common/logger';
import { BitcoinMempoolSyncProcessedEvent } from '@easylayer/bitcoin';
import { MempoolCommandFactoryService } from '../../application-layer/services';

/**
 * Handles Bitcoin mempool sync processed events.
 *
 * We handle this event in an event handler instead of a saga because:
 * - Sagas execute synchronously and would block the event processing pipeline
 * - Event handlers execute asynchronously, allowing concurrent processing
 * - Since mempool synchronization runs continuously at intervals, we don't want
 *   to couple two sync processes synchronously as it could create bottlenecks
 * - This approach prevents blocking and allows the system to handle multiple
 *   sync operations concurrently without performance issues
 */
@EventsHandler(BitcoinMempoolSyncProcessedEvent)
export class BitcoinMempoolSyncProcessedEventHandler implements IEventHandler<BitcoinMempoolSyncProcessedEvent> {
  constructor(
    private readonly log: AppLogger,
    private readonly mempoolCommandFactory: MempoolCommandFactoryService
  ) {}

  async handle({ payload }: BitcoinMempoolSyncProcessedEvent) {
    // Trigger next sync cycle through application layer command factory
    // This maintains loose coupling and allows asynchronous processing
    await this.mempoolCommandFactory.processSync({
      requestId: uuidv4(),
      hasMoreToProcess: payload.hasMoreToProcess,
    });
  }
}
