import { Inject, Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { GetModelsQuery } from '@easylayer/bitcoin';
import { NormalizedModelCtor } from '@easylayer/common/framework';
import { EventStoreReadService } from '@easylayer/common/eventstore';
import { ModelFactoryService } from '../framework';
import { NetworkModelFactoryService, MempoolModelFactoryService } from '../services';

@Injectable()
@QueryHandler(GetModelsQuery)
export class GetModelsQueryHandler implements IQueryHandler<GetModelsQuery> {
  constructor(
    private readonly eventStoreService: EventStoreReadService,
    @Inject('FrameworkModelsConstructors')
    private Models: NormalizedModelCtor[],
    private readonly modelFactoryService: ModelFactoryService,
    private readonly networkModelFactory: NetworkModelFactoryService,
    private readonly mempoolModelFactory: MempoolModelFactoryService
  ) {}

  async execute({ payload }: GetModelsQuery): Promise<any> {
    try {
      const { modelIds, filter = {} } = payload;
      const { blockHeight } = filter;

      const modelsInstances = this.Models.map((ModelCtr) => this.modelFactoryService.createNewModel(ModelCtr));
      const networkModel = this.networkModelFactory.createNewModel();
      const mempool = this.mempoolModelFactory.createNewModel();

      const models = [...modelsInstances, networkModel, mempool].filter((m) => modelIds.includes(m.aggregateId));

      if (models.length === 0) {
        throw new Error(`No models found for: ${modelIds.join(', ')}`);
      }

      return await this.eventStoreService.getManyModelsByHeight(models, blockHeight ?? Number.MAX_SAFE_INTEGER);
    } catch (error) {
      throw error;
    }
  }
}
