import { Injectable } from '@nestjs/common';
import { EventPublisher } from '@easylayer/common/cqrs';
import { EventStoreWriteRepository } from '@easylayer/common/eventstore';
import { Model } from './model';

// Type for read-only methods
export type ReadOnlyMethods<T> = {
  readonly [K in keyof T as T[K] extends (...args: any[]) => any
    ? K extends
        | `get${string}`
        | `find${string}`
        | `list${string}`
        | `search${string}`
        | `count${string}`
        | `has${string}`
        | `is${string}`
        | `check${string}`
      ? K
      : never
    : never]: T[K];
};

type ModelConstructor<T extends Model> = new () => T;

export interface IModelFactoryService {
  createNewModel<T extends Model>(ModelCtor: ModelConstructor<T>): T;
  restoreModel<T extends Model>(modelInstance: T): Promise<T>;
  getReadOnlyModel<T extends Model>(ModelCtor: ModelConstructor<T>): Promise<ReadOnlyMethods<T>>;
}

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

  public async getReadOnlyModel<T extends Model>(ModelCtor: ModelConstructor<T>): Promise<ReadOnlyMethods<T>> {
    const modelInstance = this.createNewModel(ModelCtor);
    const model = await this.repository.getOne<T>(modelInstance);

    // Create read-only proxy
    return this.createReadOnlyProxy(model);
  }

  private createReadOnlyProxy<T extends Model>(model: T): ReadOnlyMethods<T> {
    const readOnlyObject: any = {};

    const allProperties = this.getAllProperties(model);

    for (const prop of allProperties) {
      const value = (model as any)[prop];

      if (typeof value === 'function' && this.isReadOnlyMethod(prop)) {
        readOnlyObject[prop] = value.bind(model);
      }
    }

    return readOnlyObject as ReadOnlyMethods<T>;
  }

  private getAllProperties(obj: any): Set<string> {
    const props = new Set<string>();
    let current = obj;

    while (current && current !== Object.prototype) {
      Object.getOwnPropertyNames(current).forEach((prop) => {
        if (prop !== 'constructor') {
          props.add(prop);
        }
      });
      current = Object.getPrototypeOf(current);
    }

    return props;
  }

  private isReadOnlyMethod(methodName: string): boolean {
    const readOnlyPrefixes = ['get', 'find', 'list', 'search', 'count', 'has', 'is', 'check'];
    return readOnlyPrefixes.some((prefix) => methodName.startsWith(prefix));
  }
}
