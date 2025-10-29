import { Injectable, Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteService } from '@easylayer/common/eventstore';
import { SyncMempoolCommand, Mempool, BlockchainProviderService } from '@easylayer/bitcoin';
import { MempoolModelFactoryService } from '../services';
import { ModelFactoryService, Model, NormalizedModelCtor } from '../framework';
import type { MempoolTickExecutionContext } from '../framework';

@Injectable()
@CommandHandler(SyncMempoolCommand)
export class SyncMempoolCommandHandler implements ICommandHandler<SyncMempoolCommand> {
  log = new Logger(SyncMempoolCommandHandler.name);
  constructor(
    private readonly eventStore: EventStoreWriteService,
    @Inject('FrameworkModelsConstructors')
    private Models: NormalizedModelCtor[],
    private readonly modelFactoryService: ModelFactoryService,
    private readonly mempoolModelFactory: MempoolModelFactoryService,
    private readonly blockchainProvider: BlockchainProviderService
  ) {}

  async execute({ payload }: SyncMempoolCommand) {
    const { requestId } = payload;

    const mempoolModel: Mempool = await this.mempoolModelFactory.initModel();

    const models: Model[] = [];

    for (const m of this.Models) {
      models.push(await this.modelFactoryService.restoreByCtor(m));
    }

    try {
      await mempoolModel.sync({
        requestId,
        service: this.blockchainProvider,
        logger: this.log,
      });

      const ctx: MempoolTickExecutionContext = {
        mempool: this.mempoolModelFactory,
        networkConfig: this.blockchainProvider.config,
        services: {
          nodeProvider: this.blockchainProvider,
          userModelService: this.modelFactoryService,
        },
      };

      for (const m of models) {
        await m.mempoolTick?.(ctx);
      }

      await this.eventStore.save([...models, mempoolModel]);

      this.log.verbose('Mempool saved into eventstore');
    } catch (error) {
      this.log.warn('Error while syncing mempool', { args: { message: (error as any)?.message } });
      throw error;
    }
  }
}
