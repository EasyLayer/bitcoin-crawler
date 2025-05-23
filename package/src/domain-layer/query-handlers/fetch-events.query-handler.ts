import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { EventStoreReadRepository } from '@easylayer/common/eventstore';
import { FetchEventsQuery } from '@easylayer/bitcoin';

@QueryHandler(FetchEventsQuery)
export class FetchEventsQueryHandler implements IQueryHandler<FetchEventsQuery> {
  constructor(private readonly eventStoreReadRepository: EventStoreReadRepository) {}

  async execute({ payload }: FetchEventsQuery): Promise<any> {
    const { modelIds, paging = {}, filter = {} } = payload;

    const options = {
      ...filter,
      ...paging,
    };

    if (modelIds.length === 0) {
      return await this.eventStoreReadRepository.fetchEventsForOneAggregate(modelIds[0]!, options);
    } else {
      return await this.eventStoreReadRepository.fetchEventsForManyAggregates(modelIds, options);
    }
  }
}
