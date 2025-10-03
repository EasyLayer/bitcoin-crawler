import { Injectable } from '@nestjs/common';
import { EventStoreReadService } from '@easylayer/common/eventstore';
import { Model, ZeroArgModelCtor } from '@easylayer/common/framework';
import { BusinessConfig } from '../../config';

export interface IModelFactoryService {
  createNewModel<T extends Model>(ModelCtor: ZeroArgModelCtor<T>): T;
  restoreModel<T extends Model>(modelInstance: T): Promise<T>;
  restoreByCtor<T extends Model>(ModelCtor: ZeroArgModelCtor<T>): Promise<T>;
}

@Injectable()
export class ModelFactoryService implements IModelFactoryService {
  constructor(
    private readonly config: BusinessConfig,
    private readonly eventStore: EventStoreReadService
  ) {}

  public createNewModel<T extends Model>(ModelCtor: ZeroArgModelCtor<T>): T {
    return this.instantiateModel(ModelCtor);
  }

  public async restoreModel<T extends Model>(modelInstance: T): Promise<T> {
    // Delegates to the EventStore to load events/snapshots into the given instance
    return await this.eventStore.getOne<T>(modelInstance);
  }

  public async restoreByCtor<T extends Model>(ModelCtor: ZeroArgModelCtor<T>): Promise<T> {
    const instance = this.instantiateModel(ModelCtor);
    return await this.restoreModel(instance);
  }

  private instantiateModel<T extends Model>(ModelCtor: ZeroArgModelCtor<T>): T {
    try {
      // 1) Create a new instance with zero-args constructor.
      const instance = new ModelCtor();

      // 2) Set initial lastBlockHeight from business config.
      //    IMPORTANT: No fromSnapshot here (by design).
      //    We directly set the internal field so that
      //    the first processed block equals START_BLOCK_HEIGHT.
      const start = this.config.START_BLOCK_HEIGHT ?? 0;
      const normalizedHeight = start - 1;

      // WARNING:
      // - This writes a private field of AggregateRoot deliberately.
      // - Constructor is zero-args and fromSnapshot usage is disallowed.
      (instance as any)._lastBlockHeight = normalizedHeight;

      return instance;
    } catch (e) {
      throw new Error(
        `ModelFactoryService: Model "${ModelCtor.name}" must have a zero-args constructor. Error: ${
          (e as Error)?.message ?? e
        }`
      );
    }
  }
}
