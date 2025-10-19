import { Injectable, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteService } from '@easylayer/common/eventstore';
import { InitMempoolCommand, Mempool, BlockchainProviderService } from '@easylayer/bitcoin';
import { MempoolModelFactoryService } from '../services';
import { BusinessConfig } from '../../config';

@Injectable()
@CommandHandler(InitMempoolCommand)
export class InitMempoolCommandHandler implements ICommandHandler<InitMempoolCommand> {
  log = new Logger(InitMempoolCommandHandler.name);
  constructor(
    private readonly eventStore: EventStoreWriteService,
    private readonly mempoolModelFactory: MempoolModelFactoryService,
    private readonly blockchainProviderService: BlockchainProviderService,
    private readonly businessConfig: BusinessConfig
  ) {}

  async execute({ payload }: InitMempoolCommand) {
    const { requestId } = payload;

    const mempoolModel: Mempool = await this.mempoolModelFactory.initModel();

    const currentNetworkHeight = await this.blockchainProviderService.getCurrentBlockHeightFromMempool();

    if (this.businessConfig.START_BLOCK_HEIGHT) {
      throw new Error('Mempool cannot be initialized with the specified START_BLOCK_HEIGHT parameter');
    }

    try {
      await mempoolModel.init({
        requestId,
        height: currentNetworkHeight,
        logger: this.log,
      });

      await this.eventStore.save(mempoolModel);

      this.log.verbose('Mempool saved into eventstore');
    } catch (error) {
      this.log.error('Error while initializing Mempool', { args: { message: (error as any)?.message } });
      throw error;
    }
  }
}
