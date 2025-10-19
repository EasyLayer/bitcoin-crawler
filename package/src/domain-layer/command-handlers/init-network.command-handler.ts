import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteService } from '@easylayer/common/eventstore';
import { InitNetworkCommand, Network, BlockchainProviderService } from '@easylayer/bitcoin';
import { NetworkModelFactoryService } from '../services';
import { BusinessConfig } from '../../config';
import { ConsolePromptService } from '../services/console-prompt.service';
import { ModelFactoryService, NormalizedModelCtor } from '../framework';

@Injectable()
@CommandHandler(InitNetworkCommand)
export class InitNetworkCommandHandler implements ICommandHandler<InitNetworkCommand> {
  log = new Logger(InitNetworkCommandHandler.name);
  constructor(
    private readonly eventStore: EventStoreWriteService,
    private readonly networkModelFactory: NetworkModelFactoryService,
    private readonly businessConfig: BusinessConfig,
    private readonly blockchainProviderService: BlockchainProviderService,
    private readonly consolePromptService: ConsolePromptService,
    @Inject('FrameworkModelsConstructors')
    private Models: NormalizedModelCtor[],
    private readonly modelFactoryService: ModelFactoryService
  ) {}

  async execute({ payload }: InitNetworkCommand) {
    const { requestId } = payload;

    const networkModel: Network = await this.networkModelFactory.initModel();

    const currentNetworkHeight = await this.blockchainProviderService.getCurrentBlockHeightFromNetwork();
    const configStartHeight = this.businessConfig.START_BLOCK_HEIGHT;
    const currentDbHeight = networkModel.lastBlockHeight;

    try {
      const finalStartHeight = await this.determineStartHeight(
        currentDbHeight,
        configStartHeight,
        currentNetworkHeight
      );

      // Initialize the network with the determined start height
      // Note: finalStartHeight is the last indexed block height
      // init() will use this directly as blockHeight in the event
      await networkModel.init({
        requestId,
        currentNetworkHeight,
        startHeight: finalStartHeight,
        logger: this.log,
      });

      await this.eventStore.save(networkModel);

      this.log.debug('Network saved into eventstore');
    } catch (error) {
      if ((error as any)?.message === 'DATA_RESET_REQUIRED') {
        this.log.log('Clearing database as requested by user');

        const models = this.Models.map((ModelCtr) => this.modelFactoryService.createNewModel(ModelCtr));

        // Publish event that database was cleared (this will trigger saga to reinitialize)
        // This event is NOT saved to eventstore, only published to trigger saga
        await networkModel.clearChain({ requestId });

        await this.eventStore.rollback({
          modelsToRollback: [...models, networkModel],
          blockHeight: -1, // Clear everything
          modelsToSave: [networkModel],
        });

        this.log.log('Database cleared successfully, saga will reinitialize network');
        return;
      }

      this.log.error('Error while initializing Network', { args: { message: (error as any)?.message } });
      throw error;
    }
  }

  private async determineStartHeight(
    currentDbHeight: number,
    configStartHeight: number | undefined,
    currentNetworkHeight: number
  ): Promise<number> {
    // Database is considered empty if currentDbHeight is -1
    const isEmpty = currentDbHeight < 0;

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
