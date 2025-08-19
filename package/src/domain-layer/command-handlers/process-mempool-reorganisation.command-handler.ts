import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteRepository } from '@easylayer/common/eventstore';
import { AppLogger } from '@easylayer/common/logger';
import { ProcessMempoolReorganisationCommand, Mempool, BlockchainProviderService } from '@easylayer/bitcoin';
import { MempoolModelFactoryService } from '../services';

@CommandHandler(ProcessMempoolReorganisationCommand)
export class ProcessMempoolReorganisationCommandHandler
  implements ICommandHandler<ProcessMempoolReorganisationCommand>
{
  constructor(
    private readonly log: AppLogger,
    private readonly eventStore: EventStoreWriteRepository,
    private readonly mempoolModelFactory: MempoolModelFactoryService,
    private readonly blockchainProviderService: BlockchainProviderService
  ) {}

  async execute({ payload }: ProcessMempoolReorganisationCommand) {
    const { requestId, blocks } = payload;

    const mempoolModel: Mempool = await this.mempoolModelFactory.initModel();

    try {
      await mempoolModel.processReorganisation({
        requestId,
        blocks,
        service: this.blockchainProviderService,
      });

      await this.eventStore.save(mempoolModel);

      this.log.debug('Mempool reorganisation processed successfully', {
        args: {
          blocksCount: blocks.length,
          reorgToHeight: blocks[0]?.height,
          currentTxids: mempoolModel.getCurrentTxids(),
        },
      });
    } catch (error) {
      this.log.error('Error while processing mempool reorganisation', { args: { error } });
      throw error;
    }
  }
}
