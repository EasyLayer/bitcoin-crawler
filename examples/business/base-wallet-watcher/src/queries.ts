import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { ModelFactoryService } from '@easylayer/bitcoin-crawler';
import { BaseWalletWatcher } from './model';

export class GetBalanceQuery {
  constructor(public readonly addresses: string[]) {}
}

@QueryHandler(GetBalanceQuery)
export class GetBalanceQueryHandler implements IQueryHandler<GetBalanceQuery> {
  constructor(private readonly modelsService: ModelFactoryService) {}

  async execute({ addresses }: GetBalanceQuery) {
    const model = await this.modelsService.restoreByCtor(BaseWalletWatcher);

    if (!addresses || addresses.length === 0) {
      return model.getAllBalances();
    }

    const result: Record<string, string> = {};
    for (const address of addresses) {
      result[address] = model.getBalance(address);
    }
    return result;
  }
}

export class GetUnspentQuery {
  constructor(public readonly addresses: string[]) {}
}

@QueryHandler(GetUnspentQuery)
export class GetUnspentQueryHandler implements IQueryHandler<GetUnspentQuery> {
  constructor(private readonly modelsService: ModelFactoryService) {}

  async execute({ addresses }: GetUnspentQuery) {
    const model = await this.modelsService.restoreByCtor(BaseWalletWatcher);

    if (!addresses || addresses.length === 0) {
      return model.getAllUnspent();
    }

    const result: Record<string, any[]> = {};
    for (const address of addresses) {
      result[address] = model.getUnspent(address);
    }
    return result;
  }
}

export class GetTxidsQuery {
  constructor(public readonly addresses: string[]) {}
}

@QueryHandler(GetTxidsQuery)
export class GetTxidsQueryHandler implements IQueryHandler<GetTxidsQuery> {
  constructor(private readonly modelsService: ModelFactoryService) {}

  async execute({ addresses }: GetTxidsQuery) {
    const model = await this.modelsService.restoreByCtor(BaseWalletWatcher);

    if (!addresses || addresses.length === 0) {
      return model.getAllTxids();
    }

    const result: Record<string, string[]> = {};
    for (const address of addresses) {
      result[address] = model.getTxids(address);
    }
    return result;
  }
}
