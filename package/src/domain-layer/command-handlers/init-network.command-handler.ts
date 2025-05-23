import { CommandHandler, ICommandHandler } from '@easylayer/common/cqrs';
import { EventStoreWriteRepository } from '@easylayer/common/eventstore';
import { AppLogger } from '@easylayer/common/logger';
import { InitNetworkCommand, Network } from '@easylayer/bitcoin';
import { NetworkModelFactoryService } from '../services';
import { BusinessConfig } from '../../config';

@CommandHandler(InitNetworkCommand)
export class InitNetworkCommandHandler implements ICommandHandler<InitNetworkCommand> {
  constructor(
    private readonly log: AppLogger,
    private readonly eventStore: EventStoreWriteRepository,
    private readonly networkModelFactory: NetworkModelFactoryService,
    private readonly businessConfig: BusinessConfig
  ) {}

  async execute({ payload }: InitNetworkCommand) {
    try {
      const { requestId } = payload;

      const networkModel: Network = await this.networkModelFactory.initModel();

      // IMPORTANT: We add -1 because we must specify the already indexed height
      // (if this is the beginning of the chain then it is -1, 0 is the first block)
      await networkModel.init({
        requestId,
        startHeight: this.businessConfig.BITCOIN_CRAWLER_START_BLOCK_HEIGHT,
      });

      await this.eventStore.save(networkModel);

      this.log.info('Bitcoin Network successfull initialized');
    } catch (error) {
      this.log.error('Error while initialize Network', { args: { error } });
      throw error;
    }
  }
}
