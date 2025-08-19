import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteRepository } from '@easylayer/common/eventstore';
import { AppLogger } from '@easylayer/common/logger';
import { InitNetworkCommand, Network, BlockchainProviderService } from '@easylayer/bitcoin';
import { NetworkModelFactoryService } from '../services';
import { BusinessConfig } from '../../config';
import { ConsolePromptService } from '../services/console-prompt.service';
import { ModelFactoryService, ModelType } from '../framework';

@CommandHandler(InitNetworkCommand)
export class InitNetworkCommandHandler implements ICommandHandler<InitNetworkCommand> {
  constructor(
    private readonly log: AppLogger,
    private readonly eventStore: EventStoreWriteRepository,
    private readonly networkModelFactory: NetworkModelFactoryService,
    private readonly businessConfig: BusinessConfig,
    private readonly blockchainProviderService: BlockchainProviderService,
    private readonly consolePromptService: ConsolePromptService,
    @Inject('FrameworkModelsConstructors')
    private Models: ModelType[],
    private readonly modelFactoryService: ModelFactoryService
  ) {}

  async execute({ payload }: InitNetworkCommand) {
    const { requestId } = payload;

    // Get current network height for listen strategy
    const currentNetworkHeight = await this.blockchainProviderService.getCurrentBlockHeightFromNetwork();

    const networkModel: Network = await this.networkModelFactory.initModel();

    // Get configured start height (can be undefined)
    const configStartHeight = this.businessConfig.START_BLOCK_HEIGHT;

    // Get current block height from the model (last processed block or undefined if empty)
    const currentDbHeight = networkModel.currentBlockHeight;

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
        startHeight: finalStartHeight,
      });

      await this.eventStore.save(networkModel);

      this.log.info('Network successfully initialized', {
        args: {
          lastIndexedHeight: finalStartHeight,
          nextBlockToProcess: finalStartHeight + 1,
          currentNetworkHeight,
        },
      });
    } catch (error) {
      if ((error as any)?.message === 'DATA_RESET_REQUIRED') {
        // Handle database reset in catch block
        this.log.info('Clearing database as requested by user');

        // Create all models that need to be cleared
        const models = this.Models.map((ModelCtr) => this.modelFactoryService.createNewModel(ModelCtr));

        // Use rollback with blockHeight = -1 to clear all data from all tables
        await this.eventStore.rollback({
          modelsToRollback: [...models, networkModel],
          blockHeight: -1, // Clear everything
        });

        // Publish event that database was cleared (this will trigger saga to reinitialize)
        // This event is NOT saved to eventstore, only published to trigger saga
        await networkModel.clearChain({ requestId });

        // Commit this event to trigger the saga (without eventstore)
        await networkModel.commit();

        this.log.info('Database cleared successfully, saga will reinitialize network');

        return;
      }

      this.log.error('Error while initializing Network', { args: { error } });
      throw error;
    }
  }

  private async determineStartHeight(
    currentDbHeight: number | undefined,
    configStartHeight: number | undefined,
    currentNetworkHeight: number
  ): Promise<number> {
    // Case 1: Database is empty - first launch
    if (currentDbHeight === undefined) {
      if (configStartHeight === undefined) {
        // No config - listen mode: start from current network height
        return currentNetworkHeight - 1;
      } else {
        // Config set - historical mode: start from configured height
        return configStartHeight - 1;
      }
    }

    // Case 2: Database has data
    if (configStartHeight === undefined) {
      // No config - continue from where we left off
      return currentDbHeight;
    }

    // Config set - check for conflicts
    if (configStartHeight <= currentDbHeight) {
      // Allow reprocessing - just continue from current DB height
      return currentDbHeight;
    }

    if (configStartHeight > currentDbHeight + 1) {
      // Conflict: gap between DB and config
      const userConfirmed = await this.consolePromptService.askDataResetConfirmation(
        configStartHeight,
        currentDbHeight
      );
      if (!userConfirmed) {
        this.log.info('Network initialization cancelled by user');
        throw new Error('Network initialization cancelled by user');
      }
      throw new Error('DATA_RESET_REQUIRED');
    }

    // No conflict - continue with current DB height
    return currentDbHeight;
  }
}
