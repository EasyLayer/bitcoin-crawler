import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { GetMempoolOverviewQuery } from '@easylayer/bitcoin';
import { MempoolModelFactoryService } from '../../services';

@Injectable()
@QueryHandler(GetMempoolOverviewQuery)
export class GetMempoolOverviewHandler implements IQueryHandler<GetMempoolOverviewQuery> {
  constructor(private readonly mempoolModelFactory: MempoolModelFactoryService) {}

  async execute(): Promise<any> {
    const mempool = await this.mempoolModelFactory.initModel();
    return {
      stats: mempool.getMemoryUsage(),
    };
  }
}
