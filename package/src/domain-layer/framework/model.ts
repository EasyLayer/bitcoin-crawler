import { Model as FrameworkModel } from '@easylayer/common/framework';
import type { AggregateOptions } from '@easylayer/common/cqrs';

/**
 * Minimal base for zero-args models:
 * - aggregateId is taken from static `modelId` (fallback: class name)
 * - start height is fixed at class level (DEFAULT_START_HEIGHT)
 * - only explicitly overridden options are forwarded to super()
 * - no dynamic hooks, no per-model overrides beyond the static partial
 *
 * NOTE: Uses `new.target` to access the actual subclass constructor
 * before calling `super(...)` (no `this` access before super).
 */
export abstract class Model extends FrameworkModel {
  static modelId: string;
  static aggregateOptionsOverride?: Partial<AggregateOptions>;

  private static readonly DEFAULT_START_HEIGHT = -1 as const;

  constructor() {
    // IMPORTANT: Do NOT touch `this` before super().
    const Ctor = new.target as typeof Model;

    const id = (Ctor.modelId ?? Ctor.name) as string;
    const h = Model.DEFAULT_START_HEIGHT;

    // Forward only explicitly provided options (partial). If undefined, AggregateRoot defaults apply.
    const opts = (Ctor.aggregateOptionsOverride ?? undefined) as AggregateOptions | undefined;

    super(id, h, opts);
  }
}
