import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { ModelFactoryService } from '@easylayer/bitcoin-crawler';
import Model from './model';

export interface IGetPortfolioBalanceQuery {
  readonly includeAddressBreakdown?: boolean;
  readonly includeUtxos?: boolean;
}

export class GetPortfolioBalanceQuery {
  constructor(
    public readonly payload: IGetPortfolioBalanceQuery
  ) {}
}

@QueryHandler(GetPortfolioBalanceQuery)
export class GetPortfolioBalanceQueryHandler implements IQueryHandler<GetPortfolioBalanceQuery> {
  constructor(
    private readonly modelsService: ModelFactoryService
  ) {}

  async execute({ payload }: GetPortfolioBalanceQuery) {
    const { includeAddressBreakdown = false, includeUtxos = false } = payload;
    
    const model = await this.modelsService.getReadOnlyModel(Model);
    
    // Get basic portfolio stats
    const portfolioStats = model.getPortfolioStats();
    
    const result: any = {
      totalBalance: model.getTotalBalance(),
      totalBalanceBTC: model.getTotalBalanceBTC(),
      portfolioStats,
      configuration: model.getConfiguration()
    };

    // Optionally include address breakdown
    if (includeAddressBreakdown) {
      result.addressBreakdown = model.getAllAddressBalances();
    }

    // Optionally include UTXOs
    if (includeUtxos) {
      result.utxos = model.getAllUtxos();
    }

    return result;
  }
}