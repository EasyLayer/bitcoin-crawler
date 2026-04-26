import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteService } from '@easylayer/common/eventstore';
import { InitNetworkCommand, Network, BlockchainProviderService } from '@easylayer/bitcoin';
import { NetworkModelFactoryService } from '../services';
import { BusinessConfig, BootstrapConfig } from '../../config';
import { ModelFactoryService, NormalizedModelCtor } from '../framework';

@Injectable()
@CommandHandler(InitNetworkCommand)
export class InitNetworkCommandHandler implements ICommandHandler<InitNetworkCommand> {
  private readonly logger = new Logger(InitNetworkCommandHandler.name);
  constructor(
    private readonly eventStore: EventStoreWriteService,
    private readonly networkModelFactory: NetworkModelFactoryService,
    private readonly businessConfig: BusinessConfig,
    private readonly blockchainProviderService: BlockchainProviderService,
    @Inject('ConsolePromptService')
    private readonly consolePromptService: any, // TODO: to add unifed interface
    @Inject('FrameworkModelsConstructors')
    private Models: NormalizedModelCtor[],
    private readonly modelFactoryService: ModelFactoryService,
    @Inject('BootstrapConfig')
    private readonly bootstrapConfig: BootstrapConfig
  ) {}

  async execute({ payload }: InitNetworkCommand) {
    const { requestId } = payload;

    let networkModel: Network = await this.networkModelFactory.initModel();

    const currentNetworkHeight = await this.blockchainProviderService.getCurrentBlockHeightFromNetwork();
    const configStartHeight = this.businessConfig.START_BLOCK_HEIGHT;
    const bootstrapLastBlockHeight = this.bootstrapConfig.lastBlockHeight;

    try {
      if (bootstrapLastBlockHeight !== undefined) {
        networkModel = await this.alignToExternalCheckpoint({
          networkModel,
          bootstrapLastBlockHeight,
          requestId,
        });
      }

      const finalStartHeight = await this.determineStartHeight(
        networkModel.lastBlockHeight,
        configStartHeight,
        currentNetworkHeight,
        bootstrapLastBlockHeight
      );

      // Initialize the network with the determined start height.
      // Note: finalStartHeight is the last indexed block height.
      // init() publishes BitcoinNetworkInitializedEvent, which starts BlocksQueue.
      await networkModel.init({
        requestId,
        currentNetworkHeight,
        startHeight: finalStartHeight,
        logger: this.logger,
      });

      await this.eventStore.save(networkModel);

      this.logger.debug('Network saved into eventstore');
    } catch (error) {
      if ((error as any)?.message === 'DATA_RESET_REQUIRED') {
        this.logger.log('Clearing database as requested by user');

        const models = this.Models.map((ModelCtr) => this.modelFactoryService.createNewModel(ModelCtr));

        // Publish event that database was cleared (this will trigger saga to reinitialize)
        // This event is NOT saved to eventstore, only published to trigger saga
        await networkModel.clearChain({ requestId });

        await this.eventStore.rollback({
          modelsToRollback: [...models, networkModel],
          blockHeight: -1, // Clear everything
          modelsToSave: [networkModel],
        });

        this.logger.log('Database cleared successfully, saga will reinitialize network');
        return;
      }

      this.logger.error('Error while initializing Network', { args: { message: (error as any)?.message } });
      throw error;
    }
  }

  /**
   * Align the local EventStore write model with an external read-model checkpoint.
   *
   * The EventStore remains the crawler
   * write-side source of truth, but on process startup the parent uploader must
   * tell the child which height is safely committed in ReadModel.
   *
   * The alignment rules are intentionally asymmetric:
   *
   * 1. EventStore height === external checkpoint
   *    Normal resume. The crawler continues from checkpoint + 1.
   *
   * 2. EventStore height > external checkpoint
   *    Recoverable write/read-model drift. The crawler processed more blocks than
   *    ReadModel managed to commit before shutdown/crash. Roll the local write models
   *    back down to the external checkpoint so the child can emit the missing
   *    events again and rebuild the ReadModel projection without gaps.
   *
   * 3. EventStore height < external checkpoint
   *    Unsafe infrastructure mismatch. ReadModel claims committed data that the local
   *    EventStore cannot prove or replay. Do not continue automatically because
   *    it may mix a wrong DB volume/prefix or a partially restored state. The
   *    operator must restore the matching EventStore backup, reindex into a new
   *    ReadModel prefix, or explicitly roll ReadModel back with a manual recovery command.
   */
  private async alignToExternalCheckpoint({
    networkModel,
    bootstrapLastBlockHeight,
    requestId,
  }: {
    networkModel: Network;
    bootstrapLastBlockHeight: number;
    requestId: string;
  }): Promise<Network> {
    if (bootstrapLastBlockHeight < -1) {
      throw new Error('lastBlockHeight cannot be less than -1');
    }

    const currentDbHeight = networkModel.lastBlockHeight;
    const isEmpty = currentDbHeight < 0;

    if (isEmpty || currentDbHeight === bootstrapLastBlockHeight) {
      return networkModel;
    }

    if (currentDbHeight > bootstrapLastBlockHeight) {
      this.logger.warn('EventStore is ahead of external checkpoint — rolling back write models', {
        module: 'network-init',
        args: {
          currentDbHeight,
          bootstrapLastBlockHeight,
          requestId,
          action: 'rollback_to_external_checkpoint',
          models: this.Models.map((ModelCtr) => ModelCtr.name),
        },
      });

      const models = this.Models.map((ModelCtr) => this.modelFactoryService.createNewModel(ModelCtr));
      await this.eventStore.rollback({
        modelsToRollback: [...models, networkModel],
        blockHeight: bootstrapLastBlockHeight,
      });

      const restoredNetworkModel = await this.networkModelFactory.initModel();
      this.logger.log('EventStore rollback to external checkpoint completed', {
        module: 'network-init',
        args: {
          currentDbHeight,
          bootstrapLastBlockHeight,
          restoredDbHeight: restoredNetworkModel.lastBlockHeight,
        },
      });
      return restoredNetworkModel;
    }

    // ReadModel is a read-model projection checkpoint, while EventStore is the local write model.
    // If the local EventStore is behind the ReadModel committed checkpoint, this process cannot
    // prove or replay the already committed ReadModel range from local write-side state.
    // Do not continue automatically: the operator must restore the matching EventStore
    // backup, use a new ReadModel prefix for reindexing, or explicitly run an admin recovery
    // command that rolls ReadModel back to the local EventStore height.
    throw new Error(
      `External checkpoint (${bootstrapLastBlockHeight}) is ahead of local EventStore (${currentDbHeight}). ` +
        'Refusing to continue to avoid ReadModel/read-model gaps. Restore the matching EventStore backup, use a new ReadModel prefix, or run an explicit ReadModel rollback recovery command.'
    );
  }

  private async determineStartHeight(
    currentDbHeight: number,
    configStartHeight: number | undefined,
    currentNetworkHeight: number,
    bootstrapLastBlockHeight: number | undefined
  ): Promise<number> {
    // Database is considered empty if currentDbHeight is -1
    const isEmpty = currentDbHeight < 0;

    // Bootstrap runtime config has priority over START_BLOCK_HEIGHT from env.
    if (bootstrapLastBlockHeight !== undefined) {
      if (isEmpty) {
        return bootstrapLastBlockHeight;
      }

      if (currentDbHeight === bootstrapLastBlockHeight) {
        return currentDbHeight;
      }

      throw new Error(
        `Local EventStore height (${currentDbHeight}) does not match bootstrap lastBlockHeight (${bootstrapLastBlockHeight}) after checkpoint alignment`
      );
    }

    if (isEmpty) {
      // First launch: choose between live listen mode or historical mode
      if (configStartHeight === undefined) {
        // No configured start height: start from current network height (listen mode)
        return currentNetworkHeight - 1;
      } else {
        // Configured start height exists: start from configured height (historical mode)
        return configStartHeight - 1;
      }
    }

    // Database already has data and no configured start height → continue from last processed height
    if (configStartHeight === undefined) {
      return currentDbHeight;
    }

    // Config is set but points to a block already processed or behind → allow reprocessing from DB height
    if (configStartHeight <= currentDbHeight) {
      return currentDbHeight;
    }

    // Config points further ahead than currentDbHeight + 1 → possible data gap
    if (configStartHeight > currentDbHeight + 1) {
      // Ask user if they want to reset database
      const userConfirmed = await this.consolePromptService.askDataResetConfirmation(
        configStartHeight,
        currentDbHeight
      );
      if (!userConfirmed) {
        // User declined reset: abort initialization
        throw new Error('Network initialization cancelled by user');
      }
      // User confirmed: signal that full reset is required
      throw new Error('DATA_RESET_REQUIRED');
    }

    // No conflict (configStartHeight == currentDbHeight + 1): continue from current DB height
    return currentDbHeight;
  }
}
