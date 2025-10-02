// import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
// import { ModelFactoryService } from '@easylayer/bitcoin-crawler';
// import Model from './model';

// export interface IGetTopAddressesQuery {
//   readonly limit?: number;
//   readonly minBalance?: string;
//   readonly maxBalance?: string;
//   readonly address?: string;
//   readonly includeUtxos?: boolean;
//   readonly includeAnalysis?: boolean;
//   readonly includeActivity?: boolean;
//   readonly sortBy?: 'balance' | 'activity' | 'recent';
// }

// export class GetTopAddressesQuery {
//   constructor(
//     public readonly payload: IGetTopAddressesQuery
//   ) {}
// }

// @QueryHandler(GetTopAddressesQuery)
// export class GetTopAddressesQueryHandler implements IQueryHandler<GetTopAddressesQuery> {
//   constructor(
//     private readonly modelsService: ModelFactoryService
//   ) {}

//   async execute({ payload }: GetTopAddressesQuery) {
//     // const { 
//     //   limit = 100,
//     //   minBalance,
//     //   maxBalance,
//     //   address,
//     //   includeUtxos = false,
//     //   includeAnalysis = false,
//     //   includeActivity = false,
//     //   sortBy = 'balance'
//     // } = payload;
    
//     // const model = await this.modelsService.getReadOnlyModel(Model);
    
//     // const result: any = {
//     //   storageStats: model.getStorageStats(),
//     //   cacheStats: model.getScriptCacheStats()
//     // };

//     // // Handle specific address query
//     // if (address) {
//     //   const addressStats = model.getAddressStats(address);
//     //   result.addressStats = addressStats;
//     //   result.addressBalance = model.getAddressBalance(address);
      
//     //   if (includeUtxos && addressStats) {
//     //     result.addressUtxos = model.getAddressLargeUtxos(address);
//     //   }
      
//     //   return result;
//     // }

//     // // Handle range queries
//     // if (minBalance && maxBalance) {
//     //   result.addresses = model.getAddressesByBalanceRange(minBalance, maxBalance);
//     // } else {
//     //   // Handle different sorting options
//     //   switch (sortBy) {
//     //     case 'activity':
//     //       result.addresses = model.getMostActiveAddresses(limit);
//     //       break;
//     //     case 'balance':
//     //     default:
//     //       result.addresses = model.getTopAddresses(limit);
//     //       break;
//     //   }
//     // }

//     // // Apply limit if not already applied
//     // if (result.addresses && result.addresses.length > limit) {
//     //   result.addresses = result.addresses.slice(0, limit);
//     // }

//     // // Include UTXOs for each address if requested
//     // if (includeUtxos && result.addresses) {
//     //   result.addressUtxos = {};
//     //   for (const addr of result.addresses) {
//     //     result.addressUtxos[addr.address] = model.getAddressLargeUtxos(addr.address);
//     //   }
//     // }

//     // // Include top addresses analysis if requested
//     // if (includeAnalysis) {
//     //   result.topAddressesAnalysis = model.getTopAddressesAnalysis();
//     //   result.memoryEfficiency = model.getMemoryEfficiencyAnalysis();
//     // }

//     // // Include recent activity summary if requested
//     // if (includeActivity) {
//     //   result.recentActivity = model.getRecentActivitySummary(1000);
//     // }

//     // return result;
//   }
// }