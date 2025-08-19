import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteRepository } from '@easylayer/common/eventstore';
import { AppLogger } from '@easylayer/common/logger';
import { InitMempoolCommand, Mempool, BlockchainProviderService } from '@easylayer/bitcoin';
import { MempoolModelFactoryService } from '../services';
import { BusinessConfig } from '../../config';
import { ConsolePromptService } from '../services/console-prompt.service';

@CommandHandler(InitMempoolCommand)
export class InitMempoolCommandHandler implements ICommandHandler<InitMempoolCommand> {
  constructor(
    private readonly log: AppLogger,
    private readonly eventStore: EventStoreWriteRepository,
    private readonly mempoolModelFactory: MempoolModelFactoryService,
    private readonly businessConfig: BusinessConfig,
    private readonly blockchainProviderService: BlockchainProviderService,
    private readonly consolePromptService: ConsolePromptService
  ) {}

  async execute({ payload }: InitMempoolCommand) {
    const { requestId } = payload;

    // Get current network height
    const currentNetworkHeight = await this.blockchainProviderService.getCurrentBlockHeightFromMempool();

    const mempoolModel: Mempool = await this.mempoolModelFactory.initModel();

    // Get current block height from the model (last processed block or undefined if empty)
    const currentDbHeight = mempoolModel.lastBlockHeight;

    try {
      // Check if database reset is required
      await this.determineStartHeight(currentDbHeight, currentNetworkHeight);

      await mempoolModel.init({
        requestId,
        currentNetworkHeight,
        service: this.blockchainProviderService,
      });

      await this.eventStore.save(mempoolModel);

      this.log.info('Mempool successfully initialized', {
        args: {
          currentNetworkHeight,
          currentTxids: mempoolModel.getCurrentTxids(),
        },
      });
    } catch (error) {
      if ((error as any)?.message === 'DATA_RESET_REQUIRED') {
        // Handle database reset in catch block
        this.log.info('Clearing mempool database as requested by user');

        // Use rollback with blockHeight = -1 to clear all data
        await this.eventStore.rollback({
          modelsToRollback: [mempoolModel],
          blockHeight: -1, // Clear everything
        });

        // Clear mempool data
        await mempoolModel.clearMempool({ requestId });

        // Commit this event to trigger the saga
        await mempoolModel.commit();

        this.log.info('Mempool database cleared successfully, saga will reinitialize');

        return;
      }

      this.log.error('Error while initializing Mempool', { args: { error } });
      throw error;
    }
  }

  private async determineStartHeight(currentDbHeight: number, currentNetworkHeight: number): Promise<void> {
    // Case 1: Database is empty - first launch (check for initial value)
    if (currentDbHeight < 0 || !currentDbHeight) {
      return; // No issues, proceed with initialization
    }

    // Case 2: Database has data - check if network height is too far ahead
    const heightDifference = currentNetworkHeight - currentDbHeight;

    // If difference is more than 10 blocks, ask user if they want to reset
    if (heightDifference > 10) {
      const userConfirmed = await this.consolePromptService.askDataResetConfirmation(
        currentNetworkHeight,
        currentDbHeight
      );

      if (!userConfirmed) {
        this.log.info('Mempool initialization cancelled by user');
        throw new Error('Mempool initialization cancelled by user');
      }

      throw new Error('DATA_RESET_REQUIRED');
    }

    // Heights are close enough, continue with current state
  }
}
