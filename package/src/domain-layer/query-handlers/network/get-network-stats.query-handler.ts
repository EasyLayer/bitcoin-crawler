import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { GetNetworkStatsQuery } from '@easylayer/bitcoin';
import { NetworkModelFactoryService } from '../../services';

@Injectable()
@QueryHandler(GetNetworkStatsQuery)
export class GetNetworkStatsQueryHandler implements IQueryHandler<GetNetworkStatsQuery> {
  constructor(private readonly networkModelFactory: NetworkModelFactoryService) {}

  async execute({ payload }: GetNetworkStatsQuery): Promise<{
    isValid: boolean;
  }> {
    return await this.networkModelFactory.getNetworkStats();
  }
}
