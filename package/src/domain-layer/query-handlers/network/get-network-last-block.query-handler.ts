import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { GetNetworkLastBlockQuery, LightBlock } from '@easylayer/bitcoin';
import { NetworkModelFactoryService } from '../../services';

@QueryHandler(GetNetworkLastBlockQuery)
export class GetNetworkLastBlockQueryHandler implements IQueryHandler<GetNetworkLastBlockQuery> {
  constructor(private readonly networkModelFactory: NetworkModelFactoryService) {}

  async execute({ payload }: GetNetworkLastBlockQuery): Promise<{
    lastBlock: LightBlock | undefined;
    hasBlocks: boolean;
    chainStats: {
      size: number;
      currentHeight?: number;
      isEmpty: boolean;
    };
  }> {
    return await this.networkModelFactory.getLastBlock();
  }
}
