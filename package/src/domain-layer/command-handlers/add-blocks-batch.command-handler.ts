import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteRepository } from '@easylayer/common/eventstore';
import { AppLogger, RuntimeTracker } from '@easylayer/common/logger';
import {
  AddBlocksBatchCommand,
  Network,
  BlockchainProviderService,
  BlockchainValidationError,
} from '@easylayer/bitcoin';
import { NetworkModelFactoryService } from '../services';
import { Model, ModelType, ModelFactoryService } from '../../framework';
import { MetricsService } from '../../metrics.service';
import { BusinessConfig, ProvidersConfig } from '../../config';

@CommandHandler(AddBlocksBatchCommand)
export class AddBlocksBatchCommandHandler implements ICommandHandler<AddBlocksBatchCommand> {
  constructor(
    private readonly log: AppLogger,
    private readonly networkModelFactory: NetworkModelFactoryService,
    private readonly blockchainProvider: BlockchainProviderService,
    private readonly eventStore: EventStoreWriteRepository,
    private readonly metricsService: MetricsService,
    @Inject('FrameworkModelsConstructors')
    private Models: ModelType[],
    @Inject('FrameworModelFactory')
    private readonly modelFactoryService: ModelFactoryService,
    private readonly businessConfig: BusinessConfig,
    private readonly providersConfig: ProvidersConfig
  ) {}

  @RuntimeTracker({ showMemory: false, warningThresholdMs: 1000, errorThresholdMs: 3000 })
  async execute({ payload }: AddBlocksBatchCommand) {
    const { batch, requestId } = payload;

    const networkModel: Network = await this.networkModelFactory.initModel();

    let models = this.Models.map((ModelCtr) => this.modelFactoryService.createNewModel(ModelCtr));

    await this.metricsService.track('framework_restore_models', async () => {
      const result: Model[] = [];
      for (const model of models) {
        result.push(await this.modelFactoryService.restoreModel(model));
      }
      models = result;
    });

    try {
      await networkModel.addBlocks({
        requestId,
        blocks: batch,
      });

      for (let block of batch) {
        await this.metricsService.track('framework_parse_block', async () => {
          for (const model of models) {
            await model.parseBlock({
              block,
              services: {
                provider: this.blockchainProvider,
              },
              networkConfig: this.blockchainProvider.config,
            });
          }
        });
      }

      await this.metricsService.track(
        'system_eventstore_save',
        async () => await this.eventStore.save([...models, networkModel])
      );

      const stats = {
        blocksHeight: batch[batch.length - 1]?.height,
        blocksLength: batch?.length,
        blocksSize:
          batch.reduce((sum: number, b: any) => sum + b?.size, 0) /
          this.businessConfig.BITCOIN_CRAWLER_NETWORK_MAX_BLOCK_WEIGHT,
        txLength: batch.reduce((sum: number, b: any) => sum + b?.tx?.length, 0),
        vinLength: batch.reduce(
          (sum: number, b: any) => sum + b?.tx?.reduce((s: number, tx: any) => s + tx?.vin?.length, 0),
          0
        ),
        voutLength: batch.reduce(
          (sum: number, b: any) => sum + b?.tx?.reduce((s: number, tx: any) => s + tx?.vout?.length, 0),
          0
        ),
        frameworkRestoreModels: this.metricsService.getMetric('framework_restore_models'),
        frameworkParseBlockTotal: this.metricsService.getMetric('framework_parse_block'),
        systemEventstoreSaveTotal: this.metricsService.getMetric('system_eventstore_save'),
      };

      this.log.info('Blocks successfull loaded', { args: { blocksHeight: stats.blocksHeight } });
      this.log.debug('Blocks successfull loaded', { args: { ...stats } });
    } catch (error) {
      if (error instanceof BlockchainValidationError) {
        await networkModel.reorganisation({
          reorgHeight: networkModel.lastBlockHeight,
          requestId,
          blocks: [],
          service: this.blockchainProvider,
        });

        // IMPORTANT: set blockHeight from last state of Network
        const reorgHeight = networkModel.lastBlockHeight;

        await this.eventStore.rollback({
          modelsToRollback: models,
          blockHeight: reorgHeight,
          modelsToSave: [networkModel],
        });

        models = await Promise.all(
          this.Models.map((ModelCtr) =>
            this.modelFactoryService.restoreModel(this.modelFactoryService.createNewModel(ModelCtr))
          )
        );

        this.log.info('Blocks successfull reorganized', { args: { blockHeight: reorgHeight } });
        return;
      }

      this.log.error('Error while load blocks', { args: { error } });
      throw error;
    }
  }
}
