import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { FetchEventsQuery } from '@easylayer/bitcoin';
import { EventStoreReadService } from '@easylayer/common/eventstore';

@Injectable()
@QueryHandler(FetchEventsQuery)
export class FetchEventsQueryHandler implements IQueryHandler<FetchEventsQuery> {
  constructor(private readonly eventStoreService: EventStoreReadService) {}

  async execute({ payload }: FetchEventsQuery): Promise<any> {
    const { modelIds, paging = {}, filter = {}, streaming = false } = payload;
    const options = { ...filter, ...paging };
    // if (streaming) {
    //   // Return async generator for streaming
    //   return this.eventStoreService.streamEventsForManyAggregates(modelIds, options);
    // }

    // Existing non-streaming logic
    return await this.eventStoreService.fetchEventsForManyAggregates(modelIds, options);
  }
}
