import { Injectable, Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteService } from '@easylayer/common/eventstore';
import {
  AddBlocksBatchCommand,
  Network,
  Mempool,
  BlockchainProviderService,
  BlockchainValidationError,
} from '@easylayer/bitcoin';
import {
  NetworkModelFactoryService,
  MempoolModelFactoryService,
  NetworkReadService,
  MempoolReadService,
} from '../services';
import { ModelFactoryService, Model, NormalizedModelCtor } from '../framework';
import type { ProcessBlockExecutionContext } from '../framework';
import { deepFreeze } from '../../utils/deep-freeze';
import { BusinessConfig } from '../../config';

@Injectable()
@CommandHandler(AddBlocksBatchCommand)
export class AddBlocksBatchCommandHandler implements ICommandHandler<AddBlocksBatchCommand> {
  private readonly logger = new Logger(AddBlocksBatchCommandHandler.name);
  constructor(
    private readonly networkModelFactory: NetworkModelFactoryService,
    private readonly mempoolModelFactory: MempoolModelFactoryService,
    private readonly blockchainProvider: BlockchainProviderService,
    private readonly eventStore: EventStoreWriteService,
    private readonly businessConfig: BusinessConfig,
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

      // Compute irreversibleHeight: the latest processed block height minus
      // the configured depth of confirmations required to consider a block final.
      // Only passed when depth >= 0; otherwise rotation is disabled.
      const latestHeight = batch[batch.length - 1]!.height;
      const depth = this.businessConfig.NETWORK_IRREVERSIBLE_DEPTH;
      const irreversibleHeight = depth >= 0 ? Math.max(0, latestHeight - depth) : undefined;

      // Remove confirmed transactions from mempool.
      // Collect all txids from all blocks in the batch and remove them immediately
      // so they don't linger until the next refresh cycle.
      let mempoolModel: Mempool | undefined;
      if (this.blockchainProvider.mempoolManager.allProviders.length > 0) {
        const confirmedTxids = batch.flatMap((b: any) =>
          (b.tx ?? []).map((tx: any) => (typeof tx === 'string' ? tx : tx.txid)).filter(Boolean)
        );
        if (confirmedTxids.length > 0) {
          mempoolModel = await this.mempoolModelFactory.initModel();
          await mempoolModel.removeConfirmed({
            requestId,
            txids: confirmedTxids,
            blockHeight: latestHeight,
            logger: this.logger,
          });
        }
      }

      await this.eventStore.save(mempoolModel ? [...models, networkModel, mempoolModel] : [...models, networkModel], {
        irreversibleHeight,
      });

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
