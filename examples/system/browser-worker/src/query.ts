/**
 * Query definitions for the browser-worker example.
 *
 * Uses the factory pattern — no @QueryHandler decorator, no emitDecoratorMetadata.
 * Works with Vite (browser build) out of the box.
 */
import type { QueryHandlerFactory } from '@easylayer/bitcoin-crawler';
import { AddressUtxoWatcher } from './model';

export const GetBalanceQueryHandler: QueryHandlerFactory = {
  queryName: 'GetBalanceQuery',

  handle: async (dto: { addresses?: string[] }, { modelFactory }) => {
    const model = await modelFactory.restoreByCtor(AddressUtxoWatcher);

    if (!dto.addresses?.length) {
      return model.getAllBalances();
    }

    const result: Record<string, string> = {};
    for (const address of dto.addresses) {
      result[address] = model.getBalance(address);
    }
    return result;
  },
};
