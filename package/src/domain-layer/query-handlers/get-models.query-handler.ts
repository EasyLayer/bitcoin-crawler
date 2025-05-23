import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';
import { EventStoreReadRepository } from '@easylayer/common/eventstore';
import { GetModelsQuery } from '@easylayer/bitcoin';
import { ModelType, ModelFactoryService } from '../../framework';
import { NetworkModelFactoryService } from '../services';

@QueryHandler(GetModelsQuery)
export class GetModelsQueryHandler implements IQueryHandler<GetModelsQuery> {
  constructor(
    private readonly eventStoreReadRepository: EventStoreReadRepository,
    @Inject('FrameworkModelsConstructors')
    private Models: ModelType[],
    @Inject('FrameworModelFactory')
    private readonly modelFactoryService: ModelFactoryService,
    private readonly networkModelFactory: NetworkModelFactoryService
  ) {}

  async execute({ payload }: GetModelsQuery): Promise<any> {
    try {
      const { modelIds, filter = {} } = payload;
      const { blockHeight } = filter;

      const modelsInstances = this.Models.map((ModelCtr) => this.modelFactoryService.createNewModel(ModelCtr));
      const networkModel = this.networkModelFactory.createNewModel();

      const models = [...modelsInstances, networkModel].filter((m) => modelIds.includes(m.aggregateId));

      if (models.length === 0) {
        throw new Error(`No models found for: ${modelIds.join(', ')}`);
      }

      if (models.length === 1) {
        return await this.eventStoreReadRepository.getOneSnapshotByHeight(
          models[0]!,
          blockHeight ?? Number.MAX_SAFE_INTEGER
        );
      } else {
        return await this.eventStoreReadRepository.getManySnapshotByHeight(
          models,
          blockHeight ?? Number.MAX_SAFE_INTEGER
        );
      }
    } catch (error) {
      throw error;
    }
  }
}
