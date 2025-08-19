import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { ModelFactoryService } from '@easylayer/bitcoin-crawler'; 
import Model from './model';

export interface IGetNetworkBlockQuery {
  readonly limit: number;
}

export class GetTopAddressesQuery {
    constructor(
        public readonly payload: IGetNetworkBlockQuery
    ) {}
}

@QueryHandler(GetTopAddressesQuery)
export class GetTopAddressesQueryHandler implements IQueryHandler<GetTopAddressesQuery> {
  constructor(
    private readonly modelsService: ModelFactoryService
) {}

    async execute({ payload }: GetTopAddressesQuery) {
        // const { limit } = payload;
        // const model = await this.modelsService.getReadOnlyModel(Model);
        // return model.getTopAddresses(limit);
    }
}
