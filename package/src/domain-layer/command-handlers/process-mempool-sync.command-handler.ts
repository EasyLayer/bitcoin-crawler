import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteRepository } from '@easylayer/common/eventstore';
import { AppLogger } from '@easylayer/common/logger';
import { ProcessMempoolSyncCommand, Mempool, BlockchainProviderService } from '@easylayer/bitcoin';
import { MempoolModelFactoryService } from '../services';

@CommandHandler(ProcessMempoolSyncCommand)
export class ProcessMempoolSyncCommandHandler implements ICommandHandler<ProcessMempoolSyncCommand> {
  constructor(
    private readonly log: AppLogger,
    private readonly eventStore: EventStoreWriteRepository,
    private readonly mempoolModelFactory: MempoolModelFactoryService,
    private readonly blockchainProviderService: BlockchainProviderService
  ) {}

  async execute({ payload }: ProcessMempoolSyncCommand) {
    const { requestId, hasMoreToProcess } = payload;

    const mempoolModel: Mempool = await this.mempoolModelFactory.initModel();

    try {
      await mempoolModel.processSync({
        requestId,
        service: this.blockchainProviderService,
        hasMoreToProcess,
      });

      await this.eventStore.save(mempoolModel);

      this.log.debug('Mempool sync processed successfully', {
        args: {
          currentTxids: mempoolModel.getCurrentTxids(),
          isSynchronized: mempoolModel.isReady(),
        },
      });
    } catch (error) {
      this.log.error('Error while processing mempool sync', { args: { error } });
      throw error;
    }
  }
}
