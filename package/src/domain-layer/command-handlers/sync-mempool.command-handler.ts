import { Injectable, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteService } from '@easylayer/common/eventstore';
import { SyncMempoolCommand, Mempool, BlockchainProviderService } from '@easylayer/bitcoin';
import { MempoolModelFactoryService } from '../services';

@Injectable()
@CommandHandler(SyncMempoolCommand)
export class SyncMempoolCommandHandler implements ICommandHandler<SyncMempoolCommand> {
  log = new Logger(SyncMempoolCommandHandler.name);
  constructor(
    private readonly eventStore: EventStoreWriteService,
    private readonly mempoolModelFactory: MempoolModelFactoryService,
    private readonly blockchainProviderService: BlockchainProviderService
  ) {}

  async execute({ payload }: SyncMempoolCommand) {
    const { requestId, hasMoreToProcess } = payload;

    const mempoolModel: Mempool = await this.mempoolModelFactory.initModel();

    try {
      await mempoolModel.processSync({
        requestId,
        service: this.blockchainProviderService,
        hasMoreToProcess,
      });

      await this.eventStore.save(mempoolModel);

      this.log.log('Mempool sync processed successfully', {
        args: {
          currentTxids: mempoolModel.getCurrentTxids(),
          isSynchronized: mempoolModel.isReady(),
        },
      });
    } catch (error) {
      this.log.error('Error while processing mempool sync', '', { args: { error } });
      throw error;
    }
  }
}
