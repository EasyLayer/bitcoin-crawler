import { Injectable, Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteService } from '@easylayer/common/eventstore';
import {
  AddBlocksBatchCommand,
  Network,
  BlockchainProviderService,
  BlockchainValidationError,
} from '@easylayer/bitcoin';
import { NetworkModelFactoryService, NetworkReadService, MempoolReadService } from '../services';
import { ModelFactoryService, Model, NormalizedModelCtor } from '../framework';
import type { ProcessBlockExecutionContext } from '../framework';

function deepFreeze<T>(obj: T): T {
  Object.getOwnPropertyNames(obj).forEach((name) => {
    const value = (obj as any)[name];

    if (value && typeof value === 'object') {
      deepFreeze(value);
    }
  });

  return Object.freeze(obj);
}
@Injectable()
@CommandHandler(AddBlocksBatchCommand)
export class AddBlocksBatchCommandHandler implements ICommandHandler<AddBlocksBatchCommand> {
  private readonly logger = new Logger(AddBlocksBatchCommandHandler.name);
  constructor(
    private readonly networkModelFactory: NetworkModelFactoryService,
    private readonly blockchainProvider: BlockchainProviderService,
    private readonly eventStore: EventStoreWriteService,
    @Inject('FrameworkModelsConstructors')
    private Models: NormalizedModelCtor[],
    private readonly modelFactoryService: ModelFactoryService,
    private readonly networkReadService: NetworkReadService,
    private readonly mempoolReadService: MempoolReadService
  ) {}

  async execute({ payload }: AddBlocksBatchCommand) {
    const { batch, requestId } = payload;

    try {
      const networkModel: Network = await this.networkModelFactory.initModel();

      const models: Model[] = [];

      for (const m of this.Models) {
        models.push(await this.modelFactoryService.restoreByCtor(m));
      }

      await networkModel.addBlocks({ requestId, blocks: batch, logger: this.logger });

      for (const block of batch) {
        const frozen = deepFreeze(block);
        const ctx: ProcessBlockExecutionContext = {
          block: frozen,
          network: this.networkReadService,
          mempool: this.mempoolReadService,
          services: {
            nodeProvider: this.blockchainProvider,
            networkModelService: this.networkModelFactory,
            userModelService: this.modelFactoryService,
          },
          networkConfig: this.blockchainProvider.config,
        };

        for (const m of models) {
          await m.processBlock(ctx);
        }
      }

      await this.eventStore.save([...models, networkModel]);

      this.logger.verbose('Blocks saved into eventstore');
    } catch (error) {
      if (error instanceof BlockchainValidationError) {
        const networkModel: Network = await this.networkModelFactory.initModel();

        const models: Model[] = this.Models.map((ModelCtr) => this.modelFactoryService.createNewModel(ModelCtr));

        await networkModel.reorganisation({
          reorgHeight: networkModel.lastBlockHeight, // IMPORTANT: last network height
          requestId,
          blocks: [],
          service: this.blockchainProvider,
          logger: this.logger,
        });

        // IMPORTANT: set blockHeight from last state of Network AFTER state reorganisation
        const reorgHeight = networkModel.lastBlockHeight;

        await this.eventStore.rollback({
          modelsToRollback: models,
          blockHeight: reorgHeight,
          modelsToSave: [networkModel],
        });

        this.logger.debug('Blocks successfully reorganized', { args: { blockHeight: reorgHeight, requestId } });
        return;
      }

      this.logger.warn('Error while adding blocks', { args: { message: (error as any)?.message } });
      throw error;
    }
  }
}
