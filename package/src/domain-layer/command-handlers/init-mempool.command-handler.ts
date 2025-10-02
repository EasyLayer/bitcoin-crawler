import { Injectable, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteService } from '@easylayer/common/eventstore';
import { InitMempoolCommand, Mempool, BlockchainProviderService } from '@easylayer/bitcoin';
import { MempoolModelFactoryService } from '../services';
import { BusinessConfig } from '../../config';
import { ConsolePromptService } from '../services/console-prompt.service';

@Injectable()
@CommandHandler(InitMempoolCommand)
export class InitMempoolCommandHandler implements ICommandHandler<InitMempoolCommand> {
  log = new Logger(InitMempoolCommandHandler.name);
  constructor(
    private readonly eventStore: EventStoreWriteService,
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

      this.log.log('Mempool successfully initialized', {
        args: {
          currentNetworkHeight,
          currentTxids: mempoolModel.getCurrentTxids(),
        },
      });
    } catch (error) {
      if ((error as any)?.message === 'DATA_RESET_REQUIRED') {
        // Handle database reset in catch block
        this.log.log('Clearing mempool database as requested by user');

        // Clear mempool data
        await mempoolModel.clearMempool({ requestId });

        // Use rollback with blockHeight = -1 to clear all data
        await this.eventStore.rollback({
          modelsToRollback: [mempoolModel],
          blockHeight: -1, // Clear everything
          modelsToSave: [mempoolModel],
        });

        this.log.log('Mempool database cleared successfully, saga will reinitialize');

        return;
      }

      this.log.error('Error while initializing Mempool', { args: { error } });
      throw error;
    }
  }

  private async determineStartHeight(currentDbHeight: number, currentNetworkHeight: number): Promise<void> {
    const isEmpty = currentDbHeight < 0;
    if (isEmpty) {
      return;
    }

    const diff = currentNetworkHeight - currentDbHeight;
    if (diff <= 10) {
      return;
    }

    const userConfirmed = await this.consolePromptService.askDataResetConfirmation(
      currentNetworkHeight,
      currentDbHeight
    );

    if (!userConfirmed) {
      throw new Error('Mempool initialization cancelled by user');
    }

    throw new Error('DATA_RESET_REQUIRED');
  }
}
