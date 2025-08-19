import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { ModelFactoryService } from '@easylayer/bitcoin-crawler';
import AddressFlowTrackingModel from './model';

export interface IGetTopRiskFlowsQuery {
  readonly limit: number;
}

export class GetTopRiskFlowsQuery {
  constructor(
    public readonly payload: IGetTopRiskFlowsQuery
  ) {}
}

@QueryHandler(GetTopRiskFlowsQuery)
export class GetTopRiskFlowsQueryHandler implements IQueryHandler<GetTopRiskFlowsQuery> {
  constructor(
    private readonly modelsService: ModelFactoryService
  ) {}

  async execute({ payload }: GetTopRiskFlowsQuery) {
    const { limit } = payload;
    const model = await this.modelsService.getReadOnlyModel(AddressFlowTrackingModel);
    return model.getTopRiskFlows(limit);
  }
}