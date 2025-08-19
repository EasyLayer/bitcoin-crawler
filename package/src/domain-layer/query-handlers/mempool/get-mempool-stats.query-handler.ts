import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { GetMempoolStatsQuery } from '@easylayer/bitcoin';
import { MempoolModelFactoryService } from '../../services';

@QueryHandler(GetMempoolStatsQuery)
export class GetMempoolStatsQueryHandler implements IQueryHandler<GetMempoolStatsQuery> {
  constructor(private readonly mempoolModelFactory: MempoolModelFactoryService) {}

  async execute({ payload }: GetMempoolStatsQuery): Promise<{
    totalTxids: number;
    loadedMetadata: number;
    loadedFullTransactions: number;
    syncProgress: number;
    isSynchronized: boolean;
    averageFeeRate: number;
    medianFeeRate: number;
    totalProviders: number;
    feeRateDistribution: { [feeRate: number]: number };
  }> {
    return await this.mempoolModelFactory.getMempoolStats();
  }
}
