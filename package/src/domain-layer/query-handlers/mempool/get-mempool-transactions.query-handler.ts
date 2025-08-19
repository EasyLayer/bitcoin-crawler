import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { GetMempoolTransactionsQuery } from '@easylayer/bitcoin';
import { MempoolModelFactoryService } from '../../services';

@QueryHandler(GetMempoolTransactionsQuery)
export class GetMempoolTransactionsQueryHandler implements IQueryHandler<GetMempoolTransactionsQuery> {
  constructor(private readonly mempoolModelFactory: MempoolModelFactoryService) {}

  async execute({ payload }: GetMempoolTransactionsQuery): Promise<any> {
    const { onlyLoaded = false, streaming = false, batchSize = 100 } = payload;

    if (streaming) {
      // return this.mempoolModelFactory.streamTransactionsWithStats(batchSize, onlyLoaded);
    } else {
      const mempoolModel = await this.mempoolModelFactory.initModel();
      // return onlyLoaded ? mempoolModel.getLoadedTransactions() : mempoolModel.getCachedTransactions();
    }
  }
}
