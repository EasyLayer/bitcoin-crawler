import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { ModelFactoryService } from '@easylayer/bitcoin-crawler';
import Model from './model';

export interface IGetLargeTransfersQuery {
  readonly limit?: number;
  readonly minValue?: string;
  readonly maxValue?: string;
  readonly address?: string;
  readonly startBlock?: number;
  readonly endBlock?: number;
  readonly sortBy?: 'recent' | 'largest';
}

export class GetLargeTransfersQuery {
  constructor(
    public readonly payload: IGetLargeTransfersQuery
  ) {}
}

@QueryHandler(GetLargeTransfersQuery)
export class GetLargeTransfersQueryHandler implements IQueryHandler<GetLargeTransfersQuery> {
  constructor(
    private readonly modelsService: ModelFactoryService
  ) {}

  async execute({ payload }: GetLargeTransfersQuery) {
    const { 
      limit = 100,
      minValue,
      maxValue,
      address,
      startBlock,
      endBlock,
      sortBy = 'recent'
    } = payload;
    
    const model = await this.modelsService.getReadOnlyModel(Model);
    
    let transfers;

    // Apply filters based on query parameters
    if (address) {
      transfers = model.getTransfersByAddress(address);
    } else if (minValue && maxValue) {
      transfers = model.getTransfersByValueRange(minValue, maxValue);
    } else if (startBlock && endBlock) {
      transfers = model.getTransfersByBlockRange(startBlock, endBlock);
    } else if (sortBy === 'largest') {
      transfers = model.getLargestTransfers(limit);
    } else {
      transfers = model.getRecentTransfers(limit);
    }

    // Apply limit if not already applied
    if (transfers.length > limit) {
      transfers = transfers.slice(0, limit);
    }

    return {
      transfers,
      transferStats: model.getTransferStats(),
      storageStats: model.getStorageStats(),
      cacheStats: model.getScriptCacheStats()
    };
  }
}