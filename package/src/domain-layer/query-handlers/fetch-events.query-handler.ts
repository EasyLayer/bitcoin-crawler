import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { FetchEventsQuery } from '@easylayer/bitcoin';

@Injectable()
@QueryHandler(FetchEventsQuery)
export class FetchEventsQueryHandler implements IQueryHandler<FetchEventsQuery> {
  constructor() {} // private readonly eventStoreReadRepository: EventStoreReadRepository

  async execute({ payload }: FetchEventsQuery): Promise<any> {
    // const { modelIds, paging = {}, filter = {}, streaming = false } = payload;
    // const options = { ...filter, ...paging };
    // if (streaming) {
    //   // Return async generator for streaming
    //   if (modelIds.length === 1) {
    //     return this.eventStoreReadRepository.streamEventsForOneAggregate(modelIds[0]!, options);
    //   } else {
    //     return this.eventStoreReadRepository.streamEventsForManyAggregates(modelIds, options);
    //   }
    // }
    // // Existing non-streaming logic
    // if (modelIds.length === 1) {
    //   return await this.eventStoreReadRepository.fetchEventsForOneAggregate(modelIds[0]!, options);
    // } else {
    //   return await this.eventStoreReadRepository.fetchEventsForManyAggregates(modelIds, options);
    // }
  }
}
