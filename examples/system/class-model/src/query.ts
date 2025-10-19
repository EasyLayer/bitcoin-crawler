import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { ModelFactoryService } from '@easylayer/bitcoin-crawler';
import { AddressUtxoWatcher } from './model';

export class GetBalanceQuery {
  constructor(
    public readonly addresses: string[]
  ) {}
}

@QueryHandler(GetBalanceQuery)
export class GetBalanceQueryHandler implements IQueryHandler<GetBalanceQuery> {
  constructor(private readonly modelsService: ModelFactoryService) {}

  async execute({ addresses }: GetBalanceQuery) {
    const model = await this.modelsService.restoreByCtor(AddressUtxoWatcher);

    if (addresses.length === 0) {
      return model.getAllBalances();
    }

    const result: Record<string, string> = {};
    for (const address of addresses) {
      result[address] = model.getBalance(address);
    }
    return result;
  }
}
