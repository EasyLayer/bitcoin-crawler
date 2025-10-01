import { Injectable } from '@nestjs/common';
import { EventStoreReadService } from '@easylayer/common/eventstore';
import { Model, ZeroArgModelCtor } from '@easylayer/common/framework';

export interface IModelFactoryService {
  createNewModel<T extends Model>(ModelCtor: ZeroArgModelCtor<T>): T;
  restoreModel<T extends Model>(modelInstance: T): Promise<T>;
}

@Injectable()
export class ModelFactoryService implements IModelFactoryService {
  constructor(private readonly eventStore: EventStoreReadService) {}

  public createNewModel<T extends Model>(ModelCtor: ZeroArgModelCtor<T>): T {
    return this.instantiateModel(ModelCtor);
  }

  public async restoreModel<T extends Model>(modelInstance: T): Promise<T> {
    return await this.eventStore.getOne<T>(modelInstance);
  }

  private instantiateModel<T extends Model>(ModelCtor: ZeroArgModelCtor<T>): T {
    try {
      return new ModelCtor();
    } catch (e) {
      throw new Error(
        `ModelFactoryService: Model "${ModelCtor.name}" must have a zero-args constructor. Error: ${
          (e as Error)?.message ?? e
        }`
      );
    }
  }
}
