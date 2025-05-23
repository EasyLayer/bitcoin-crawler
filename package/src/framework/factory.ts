import { Injectable } from '@nestjs/common';
import { EventPublisher } from '@easylayer/common/cqrs';
import { EventStoreWriteRepository } from '@easylayer/common/eventstore';
import { Model } from './model';

type ModelConstructor<T extends Model> = new () => T;

export interface IModelFactoryService {
  createNewModel<T extends Model>(ModelCtor: ModelConstructor<T>): T;

  restoreModel<T extends Model>(modelInstance: T): Promise<T>;
}

// TODO: add method for restoreManyModels in one query
@Injectable()
export class ModelFactoryService implements IModelFactoryService {
  constructor(
    private readonly repository: EventStoreWriteRepository,
    private readonly publisher: EventPublisher
  ) {}

  public createNewModel<T extends Model>(ModelCtor: ModelConstructor<T>): T {
    return this.publisher.mergeObjectContext<T>(new ModelCtor());
  }

  public async restoreModel<T extends Model>(modelInstance: T): Promise<T> {
    const model = await this.repository.getOne<T>(modelInstance);
    return model;
  }
}
