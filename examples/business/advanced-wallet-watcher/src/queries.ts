import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { ModelFactoryService } from '@easylayer/bitcoin-crawler';
import { AdvancedWalletWatcher } from './model';

// Returns compact per-tx status (firstSeen, confirmed, rbf flag, touches)
export class GetTxStatusQuery {
  constructor(public readonly txids: string[]) {}
}

@QueryHandler(GetTxStatusQuery)
export class GetTxStatusQueryHandler implements IQueryHandler<GetTxStatusQuery> {
  constructor(private readonly modelsService: ModelFactoryService) {}
  async execute({ txids }: GetTxStatusQuery) {
    const model = await this.modelsService.restoreByCtor(AdvancedWalletWatcher);
    if (!txids || txids.length === 0) return {};
    const res: Record<string, ReturnType<AdvancedWalletWatcher['getTxStatus']>> = {};
    for (const id of txids) res[id] = model.getTxStatus(id);
    return res;
  }
}

// Returns list of txids per address (touching), with confirmed flag
export class GetAddressSeenQuery {
  constructor(public readonly addresses: string[]) {}
}

@QueryHandler(GetAddressSeenQuery)
export class GetAddressSeenQueryHandler implements IQueryHandler<GetAddressSeenQuery> {
  constructor(private readonly modelsService: ModelFactoryService) {}
  async execute({ addresses }: GetAddressSeenQuery) {
    const model = await this.modelsService.restoreByCtor(AdvancedWalletWatcher);
    if (!addresses || addresses.length === 0) return model.getAllAddressesSeen();
    const res: Record<string, { txid: string; confirmed: boolean }[]> = {};
    for (const a of addresses) res[a] = model.getAddressSeen(a);
    return res;
  }
}
