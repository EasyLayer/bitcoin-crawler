import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { GetNetworkBlockQuery, LightBlock } from '@easylayer/bitcoin';
import { NetworkModelFactoryService } from '../../services';

@QueryHandler(GetNetworkBlockQuery)
export class GetNetworkBlockQueryHandler implements IQueryHandler<GetNetworkBlockQuery> {
  constructor(private readonly networkModelFactory: NetworkModelFactoryService) {}

  async execute({ payload }: GetNetworkBlockQuery): Promise<{
    block: LightBlock | null;
    exists: boolean;
    chainStats: {
      currentHeight?: number;
      totalBlocks: number;
    };
  }> {
    const { height } = payload;
    return await this.networkModelFactory.getBlock(height);
  }
}
