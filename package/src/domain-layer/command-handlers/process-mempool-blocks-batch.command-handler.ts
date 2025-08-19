import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteRepository } from '@easylayer/common/eventstore';
import { AppLogger } from '@easylayer/common/logger';
import { ProcessMempoolBlocksBatchCommand, Mempool, BlockchainProviderService } from '@easylayer/bitcoin';
import { MempoolModelFactoryService } from '../services';

@CommandHandler(ProcessMempoolBlocksBatchCommand)
export class ProcessMempoolBlocksBatchCommandHandler implements ICommandHandler<ProcessMempoolBlocksBatchCommand> {
  constructor(
    private readonly log: AppLogger,
    private readonly eventStore: EventStoreWriteRepository,
    private readonly mempoolModelFactory: MempoolModelFactoryService,
    private readonly blockchainProviderService: BlockchainProviderService
  ) {}

  async execute({ payload }: ProcessMempoolBlocksBatchCommand) {
    const { requestId, blocks } = payload;

    const mempoolModel: Mempool = await this.mempoolModelFactory.initModel();

    try {
      await mempoolModel.processBlocksBatch({
        requestId,
        blocks,
      });

      await this.eventStore.save(mempoolModel);

      this.log.debug('Mempool blocks batch processed successfully', {
        args: {
          blocksCount: blocks.length,
          latestBlockHeight: blocks[blocks.length - 1]?.height,
          currentTxids: mempoolModel.getCurrentTxids(),
        },
      });
    } catch (error) {
      this.log.error('Error while processing mempool blocks batch', { args: { error } });
      throw error;
    }
  }
}
