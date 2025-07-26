import { Injectable } from '@nestjs/common';
import { EventPublisher } from '@easylayer/common/cqrs';
import { EventStoreWriteRepository } from '@easylayer/common/eventstore';
import { Network } from '@easylayer/bitcoin';
import { BlocksQueueConfig } from '../../config';

export const NETWORK_AGGREGATE_ID = 'network';

@Injectable()
export class NetworkModelFactoryService {
  constructor(
    private readonly publisher: EventPublisher,
    private readonly networkWriteRepository: EventStoreWriteRepository<Network>,
    private readonly blocksQueueConfig: BlocksQueueConfig
  ) {}

  public createNewModel(): Network {
    return this.publisher.mergeObjectContext(
      new Network({
        maxSize: Math.max(this.blocksQueueConfig.BLOCKS_QUEUE_LOADER_PRELOADER_BASE_COUNT, 1000),
        aggregateId: NETWORK_AGGREGATE_ID,
      })
    );
  }

  public async initModel(): Promise<Network> {
    const model = await this.networkWriteRepository.getOne(this.createNewModel());
    return model;
  }
}
