import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { GetNetworkLastBlockQuery, LightBlock } from '@easylayer/bitcoin';
import { NetworkModelFactoryService } from '../../services';

@Injectable()
@QueryHandler(GetNetworkLastBlockQuery)
export class GetNetworkLastBlockQueryHandler implements IQueryHandler<GetNetworkLastBlockQuery> {
  constructor(private readonly networkModelFactory: NetworkModelFactoryService) {}

  async execute({ payload }: GetNetworkLastBlockQuery): Promise<{
    lastBlock: LightBlock | undefined;
  }> {
    return await this.networkModelFactory.getLastBlock();
  }
}
