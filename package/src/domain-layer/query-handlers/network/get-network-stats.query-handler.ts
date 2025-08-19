import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { GetNetworkStatsQuery } from '@easylayer/bitcoin';
import { NetworkModelFactoryService } from '../../services';

@QueryHandler(GetNetworkStatsQuery)
export class GetNetworkStatsQueryHandler implements IQueryHandler<GetNetworkStatsQuery> {
  constructor(private readonly networkModelFactory: NetworkModelFactoryService) {}

  async execute({ payload }: GetNetworkStatsQuery): Promise<{
    size: number;
    maxSize: number;
    currentHeight?: number;
    firstHeight?: number;
    isEmpty: boolean;
    isFull: boolean;
    isValid: boolean;
  }> {
    return await this.networkModelFactory.getNetworkStats();
  }
}
