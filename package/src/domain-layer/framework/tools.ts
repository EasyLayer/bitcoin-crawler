import type {
  DeclarativeModel,
  CompiledModelClass,
  Model,
  ModelInput,
  NormalizedModelCtor,
} from '@easylayer/common/framework';
import { compileStateModel, normalizeModels } from '@easylayer/common/framework';
import { walkBTC } from './walker';

export function compileStateModelBTC<State>(decl: DeclarativeModel<State>): CompiledModelClass<State> {
  return compileStateModel<State>(decl, walkBTC);
}

export function normalizeModelsBTC<T extends Model>(models: ModelInput<T>[]): NormalizedModelCtor<T>[] {
  return normalizeModels(models as unknown as ModelInput[], walkBTC) as NormalizedModelCtor<T>[];
}
