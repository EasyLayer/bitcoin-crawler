import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { GetNetworkBlockQuery, LightBlock } from '@easylayer/bitcoin';
import { NetworkModelFactoryService } from '../../services';

@Injectable()
@QueryHandler(GetNetworkBlockQuery)
export class GetNetworkBlockQueryHandler implements IQueryHandler<GetNetworkBlockQuery> {
  constructor(private readonly networkModelFactory: NetworkModelFactoryService) {}

  async execute({ payload }: GetNetworkBlockQuery): Promise<{
    block: LightBlock | null;
    exists: boolean;
  }> {
    const { height } = payload;
    return await this.networkModelFactory.getBlock(height);
  }
}
