import { normalizeModels } from './normalizer';
import type { ModelInput, NormalizedModelCtor } from './normalizer';
import type { DeclarativeModel, CompiledModelClass } from './declarative';
import { compileStateModel } from './declarative';
import { walkBTC } from './walker';
import type { Model } from './model';

export function compileStateModelBTC<State>(decl: DeclarativeModel<State>): CompiledModelClass<State> {
  return compileStateModel<State>(decl, walkBTC);
}

/**
 * Normalizes a list of model providers (class ctors or declarative descriptors)
 * into zero-arg constructors with the BTC walker bound for declarative ones.
 */
export function normalizeModelsBTC<T extends Model>(models: ModelInput<T>[]): NormalizedModelCtor<T>[] {
  return normalizeModels(models as unknown as ModelInput[], walkBTC) as NormalizedModelCtor<T>[];
}
