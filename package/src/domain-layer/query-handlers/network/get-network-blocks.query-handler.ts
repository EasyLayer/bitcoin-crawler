import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { GetNetworkBlocksQuery, LightBlock } from '@easylayer/bitcoin';
import { NetworkModelFactoryService } from '../../services';

@Injectable()
@QueryHandler(GetNetworkBlocksQuery)
export class GetNetworkBlocksQueryHandler implements IQueryHandler<GetNetworkBlocksQuery> {
  constructor(private readonly networkModelFactory: NetworkModelFactoryService) {}

  async execute({ payload }: GetNetworkBlocksQuery): Promise<{
    blocks: LightBlock[];
    requestedCount?: number;
  }> {
    const { lastN, all = false } = payload;
    return await this.networkModelFactory.getBlocks(lastN, all);
  }
}
