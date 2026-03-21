/**
 * Query definitions for the desktop example.
 *
 * Uses the factory pattern — no @QueryHandler decorator, no emitDecoratorMetadata.
 * Works with esbuild out of the box.
 *
 * bootstrap() wires these via query-factory.ts:
 *   1. Creates a plain QueryClass with constructor.name === queryName
 *   2. Creates an adapter @QueryHandler class that calls handle() at execute() time
 *   3. Passes the adapter to CqrsModule — no user decorator needed
 */
import type { QueryHandlerFactory } from '@easylayer/bitcoin-crawler';
import { AddressUtxoWatcher } from './model';

export const GetBalanceQueryHandler: QueryHandlerFactory = {
  queryName: 'GetBalanceQuery',

  handle: async (dto: { addresses?: string[] }, { modelFactory }) => {
    // Restore the AddressUtxoWatcher model from EventStore
    const model = await modelFactory.restoreByCtor(AddressUtxoWatcher);

    if (!dto.addresses || dto.addresses.length === 0) {
      // Return all tracked addresses with their balances
      return model.getAllBalances();
    }

    // Return only the requested addresses
    const result: Record<string, string> = {};
    for (const address of dto.addresses) {
      result[address] = model.getBalance(address);
    }
    return result;
  },
};
