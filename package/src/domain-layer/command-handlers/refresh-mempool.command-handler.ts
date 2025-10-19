import { Injectable, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteService } from '@easylayer/common/eventstore';
import { RefreshMempoolCommand, Mempool } from '@easylayer/bitcoin';
import { MempoolModelFactoryService } from '../services';

@Injectable()
@CommandHandler(RefreshMempoolCommand)
export class RefreshMempoolCommandHandler implements ICommandHandler<RefreshMempoolCommand> {
  log = new Logger(RefreshMempoolCommandHandler.name);
  constructor(
    private readonly eventStore: EventStoreWriteService,
    private readonly mempoolModelFactory: MempoolModelFactoryService
  ) {}

  async execute({ payload }: RefreshMempoolCommand) {
    const { requestId, height, perProvider } = payload;

    const mempoolModel: Mempool = await this.mempoolModelFactory.initModel();

    try {
      await mempoolModel.refresh({
        requestId,
        height,
        perProvider,
        logger: this.log,
      });

      await this.eventStore.save(mempoolModel);

      this.log.verbose('Mempool saved into eventstore');
    } catch (error) {
      this.log.warn('Error while refreshing mempool', '', { args: { message: (error as any)?.message } });
      throw error;
    }
  }
}
