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
    const { requestId } = payload;

    const mempoolModel: Mempool = await this.mempoolModelFactory.initModel();

    try {
      await mempoolModel.sync({
        requestId,
        service: this.blockchainProviderService,
        logger: this.log,
      });

      await this.eventStore.save(mempoolModel);

      this.log.verbose('Mempool saved into eventstore');
    } catch (error) {
      this.log.warn('Error while syncing mempool', { args: { message: (error as any)?.message } });
      throw error;
    }
  }
}
