// queries.ts
import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { ModelFactoryService } from '@easylayer/bitcoin-crawler';
import { AdvancedWalletWatcher } from './model';

// ===== DTOs =====
export type TxStatusView = {
  txid: string;
  // true if the tx was ever seen in mempool (current model tracks firstSeenSource;
  // if you later начнёшь хранить "everSeenInMempool", просто подставь поле)
  seenInMempool: boolean;
  // true if we saw it in a block (either firstSeenSource === 'block' or it is confirmed)
  seenInBlock: boolean;
  // first seen metadata as is
  firstSeenSource: 'mempool' | 'block';
  firstSeenAtHeight: number;
  // confirmation info if present
  confirmed: null | { height: number; blockHash: string; index: number };
  // wallet-centric info
  touches: string[];
  signaledRbf: boolean;
};

// Returns compact per-tx status (now with seenInMempool/seenInBlock flags)
export class GetTxStatusQuery {
  constructor(public readonly txids: string[]) {}
}

@QueryHandler(GetTxStatusQuery)
export class GetTxStatusQueryHandler implements IQueryHandler<GetTxStatusQuery> {
  constructor(private readonly modelsService: ModelFactoryService) {}

  async execute({ txids }: GetTxStatusQuery) {
    const model = await this.modelsService.restoreByCtor(AdvancedWalletWatcher);
    if (!txids || txids.length === 0) return {};

    const res: Record<string, TxStatusView | null> = {};
    for (const id of txids) {
      const s = model.getTxStatus(id);
      if (!s) {
        res[id] = null;
        continue;
      }

      const seenInMempool = s.firstSeenSource === 'mempool';
      const seenInBlock = s.firstSeenSource === 'block' || Boolean(s.confirmed);

      res[id] = {
        txid: s.txid,
        seenInMempool,
        seenInBlock,
        firstSeenSource: s.firstSeenSource,
        firstSeenAtHeight: s.firstSeenAtHeight,
        confirmed: s.confirmed,
        touches: s.touches,
        signaledRbf: s.signaledRbf,
      };
    }
    return res;
  }
}


// Request: list of addresses; if empty, return all watched
export class GetAddressSeenQuery {
  constructor(public readonly addresses: string[]) {}
}

export type AddressSeenView = {
  // txs that touch this address and are not yet confirmed
  pending: string[];
  // txs confirmed on-chain that touch this address
  confirmed: string[];
};

@QueryHandler(GetAddressSeenQuery)
export class GetAddressSeenQueryHandler implements IQueryHandler<GetAddressSeenQuery> {
  constructor(private readonly modelsService: ModelFactoryService) {}

  async execute({ addresses }: GetAddressSeenQuery) {
    const model = await this.modelsService.restoreByCtor(AdvancedWalletWatcher);

    // If no addresses provided, return full map grouped into pending/confirmed
    if (!addresses || addresses.length === 0) {
      const all = model.getAllAddressesSeen();
      const out: Record<string, AddressSeenView> = {};
      for (const [addr, list] of Object.entries(all)) {
        const pending: string[] = [];
        const confirmed: string[] = [];
        for (const rec of list) {
          if (rec.confirmed) confirmed.push(rec.txid);
          else pending.push(rec.txid);
        }
        out[addr] = { pending, confirmed };
      }
      return out;
    }

    // Filtered addresses path
    const res: Record<string, AddressSeenView> = {};
    for (const a of addresses) {
      const list = model.getAddressSeen(a) || [];
      const pending: string[] = [];
      const confirmed: string[] = [];
      for (const rec of list) {
        if (rec.confirmed) confirmed.push(rec.txid);
        else pending.push(rec.txid);
      }
      res[a] = { pending, confirmed };
    }
    return res;
  }
}
