import { Injectable, Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreService } from '@easylayer/common/eventstore';
import {
  AddBlocksBatchCommand,
  Network,
  Mempool,
  BlockchainProviderService,
  BlockchainValidationError,
  Block,
  LightBlock,
} from '@easylayer/bitcoin';
import { Model, NormalizedModelCtor, ExecutionContext } from '@easylayer/common/framework';
import { NetworkModelFactoryService, MempoolModelFactoryService } from '../services';
import { MetricsService } from '../../metrics.service';
import { BusinessConfig, ProvidersConfig } from '../../config';
import { ModelFactoryService } from '../framework';

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
  log = new Logger(AddBlocksBatchCommandHandler.name);
  constructor(
    private readonly networkModelFactory: NetworkModelFactoryService,
    private readonly mempoolModelFactory: MempoolModelFactoryService,
    private readonly blockchainProvider: BlockchainProviderService,
    private readonly eventStore: EventStoreService,
    private readonly metricsService: MetricsService,
    @Inject('FrameworkModelsConstructors')
    private Models: NormalizedModelCtor[],
    private readonly modelFactoryService: ModelFactoryService,
    private readonly businessConfig: BusinessConfig,
    private readonly providersConfig: ProvidersConfig
  ) {}

  async execute({ payload }: AddBlocksBatchCommand) {
    // console.timeEnd('TIME_BETWEEN_COMMAND');
    const { batch, requestId } = payload;

    const networkModel: Network = await this.networkModelFactory.initModel();

    let models = this.Models.map((ModelCtr) => this.modelFactoryService.createNewModel(ModelCtr));

    // await this.metricsService.track('framework_restore_models', async () => {
    const result: Model[] = [];
    for (const model of models) {
      result.push(await this.modelFactoryService.restoreModel(model));
    }
    models = result;
    // });

    try {
      const lightBlocks = batch.map(
        (block: Block) =>
          ({
            hash: block.hash,
            previousblockhash: block.previousblockhash,
            merkleroot: block.merkleroot,
            height: block.height,
            tx: block.tx?.map((item) => item.txid),
          }) as LightBlock
      );

      await networkModel.addBlocks({
        requestId,
        blocks: lightBlocks,
      });
      // console.time('FRAMEWORK');
      for (let block of batch) {
        // await this.metricsService.track('framework_parse_block', async () => {
        for (const model of models) {
          const context: ExecutionContext = {
            // Deep freeze the original block
            block: deepFreeze(block),
            mempool: this.mempoolModelFactory,
            services: {
              nodeProvider: this.blockchainProvider,
              networkModelService: this.networkModelFactory,
              userModelService: this.modelFactoryService,
            },
            networkConfig: this.blockchainProvider.config,
          };
          await model.processBlock(context);
        }
        // });
      }
      // console.timeEnd('FRAMEWORK');
      // await this.metricsService.track(
      //   'system_eventstore_save',
      //   async () => await this.eventStore.save([...models, networkModel])
      // );

      let mempoolModel: Mempool | null = null;

      if (
        Array.isArray(this.providersConfig.PROVIDER_MEMPOOL_RPC_URLS) &&
        this.providersConfig.PROVIDER_MEMPOOL_RPC_URLS.length > 0
      ) {
        mempoolModel = await this.mempoolModelFactory.initModel();

        await mempoolModel.processBlocksBatch({
          requestId,
          blocks: lightBlocks,
        });

        this.log.debug('Mempool blocks batch processed successfully');
      }

      // console.time('DATABASE');
      await this.eventStore.save([...models, networkModel, ...(mempoolModel ? [mempoolModel] : [])]);
      // console.timeEnd('DATABASE');
      const stats = {
        blocksHeight: batch[batch.length - 1]?.height,
        blocksLength: batch?.length,
        blocksSize:
          batch.reduce((sum: number, b: any) => sum + b?.size, 0) / this.businessConfig.NETWORK_MAX_BLOCK_WEIGHT,
        txLength: batch.reduce((sum: number, b: any) => sum + b?.tx?.length, 0),
        vinLength: batch.reduce(
          (sum: number, b: any) => sum + b?.tx?.reduce((s: number, tx: any) => s + tx?.vin?.length, 0),
          0
        ),
        voutLength: batch.reduce(
          (sum: number, b: any) => sum + b?.tx?.reduce((s: number, tx: any) => s + tx?.vout?.length, 0),
          0
        ),
        // frameworkRestoreModels: this.metricsService.getMetric('framework_restore_models'),
        // frameworkParseBlockTotal: this.metricsService.getMetric('framework_parse_block'),
        // systemEventstoreSaveTotal: this.metricsService.getMetric('system_eventstore_save'),
      };

      this.log.log('Blocks successfull loaded', { args: { blocksHeight: stats.blocksHeight } });
      // this.log.debug('Blocks successfull loaded', { args: { ...stats } });

      // console.time('TIME_BETWEEN_COMMAND');
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

        let mempoolModel: Mempool | null = null;

        if (
          Array.isArray(this.providersConfig.PROVIDER_MEMPOOL_RPC_URLS) &&
          this.providersConfig.PROVIDER_MEMPOOL_RPC_URLS.length > 0
        ) {
          mempoolModel = await this.mempoolModelFactory.initModel();

          await mempoolModel.processReorganisation({
            requestId,
            reorgHeight,
            service: this.blockchainProvider,
          });

          this.log.debug('Mempool reorganisation processed successfully');
        }

        await this.eventStore.rollback({
          modelsToRollback: models,
          blockHeight: reorgHeight,
          modelsToSave: [networkModel, ...(mempoolModel ? [mempoolModel] : [])],
        });

        models = await Promise.all(
          this.Models.map((ModelCtr) =>
            this.modelFactoryService.restoreModel(this.modelFactoryService.createNewModel(ModelCtr))
          )
        );

        this.log.log('Blocks successfull reorganized', { args: { blockHeight: reorgHeight } });
        return;
      }

      this.log.error('Error while load blocks', ``, { args: { error } });
      throw error;
    }
  }
}
