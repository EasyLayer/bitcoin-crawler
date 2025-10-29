import type { Model, ZeroArgModelCtor } from '@easylayer/common/framework';
import type { AggregateOptions } from '@easylayer/common/cqrs';
import { StateModel } from './state-model';
import type { ProcessBlockExecutionContext, MempoolTickExecutionContext } from '../types';

// Emits a compiled zero-args class with { state } on the instance
export type CompiledModelClass<State, T extends Model = Model> = ZeroArgModelCtor<T & { state: State }>;

// Reducer: pure mutator of state. No `this`, only (state, event)
export type ReducerFn<State, E = any> = (state: State, e: E) => void;
export type ReducersMap<State> = Record<string, ReducerFn<State, any>>;

// Selector: pure read helper. Receives readonly state and extra args
export type SelectorFn<State, R = any> = (state: Readonly<State>, ...args: any[]) => R;
export type SelectorsMap<State> = Record<string, SelectorFn<State, any>>;

// Walker signature remains generic (we stream sub-contexts)
export type Walker = (from: string, source: any, fn: (ctx: any) => void | Promise<void>) => Promise<void>;

/** Per-block accumulator (not persisted). */
export type Locals = {
  vout: any[];
  vin: any[];
  tx: any[];
};

// Minimal, read-only state wrapper for sources (compile-time only)
type R<State> = Readonly<State>;

/** Base ctx for block-phase handlers; `locals` is per-block. */
export interface BlockBaseCtx<State> extends ProcessBlockExecutionContext {
  /** Read-only view of model state; do not mutate here. */
  state: R<State>;
  /** Emit domain events; users call this manually where needed. */
  applyEvent: (eventName: string, blockHeight: number, payload?: any) => void;
  /** Per-block accumulator; not persisted. */
  locals: Locals;
}

/** Base ctx for mempool-phase handlers; reuses the same Locals shape. */
export interface MempoolBaseCtx<State> extends MempoolTickExecutionContext {
  /** Read-only view of model state; do not mutate here. */
  state: R<State>;
  /** Emit domain events; users call this manually where needed. */
  applyEvent: (eventName: string, blockHeight: number, payload?: any) => void;
  /** Per-tick accumulator; not persisted. */
  locals: Locals;
}

// Block-phase contexts
export interface VoutCtx<State> extends BlockBaseCtx<State> {
  block: any;
  tx: any;
  vout: any;
}
export interface VinCtx<State> extends BlockBaseCtx<State> {
  block: any;
  tx: any;
  vin: any;
}
export interface TxCtx<State> extends BlockBaseCtx<State> {
  block: any;
  tx: any;
}
export interface BlockCtx<State> extends BlockBaseCtx<State> {
  block: any;
}

// Mempool-phase contexts (no block snapshot)
export interface MempoolCtx<State> extends MempoolBaseCtx<State> {
  /** Full mempool snapshot object with tx: any[] */
  mempool: any;
}
export interface MempoolTxCtx<State> extends MempoolBaseCtx<State> {
  /** Single unconfirmed transaction from mempool. */
  tx: any;
}

// High-level source handlers; returned values will be appended into ctx.locals.<phase>
export type SourceHandlers<State> = {
  vout?: (ctx: VoutCtx<State>) => any | any[] | void | Promise<any | any[] | void>;
  vin?: (ctx: VinCtx<State>) => any | any[] | void | Promise<any | any[] | void>;
  tx?: (ctx: TxCtx<State>) => any | any[] | void | Promise<any | any[] | void>;
  block?: (ctx: BlockCtx<State>) => void | Promise<void>;

  /** Mempool tick: whole-mempool handler (called once per tick). */
  mempool?: (ctx: MempoolCtx<State>) => any | any[] | void | Promise<any | any[] | void>;
  /** Mempool tick: per-transaction handler (called for each tx). */
  mempoolTx?: (ctx: MempoolTxCtx<State>) => any | any[] | void | Promise<any | any[] | void>;
};

/** Declarative model descriptor. */
export type DeclarativeModel<State> = {
  /** Aggregate/model id; must be unique. */
  modelId: string;
  /** Initial state object or factory. */
  state: State | (() => State);
  /** Reducers map; attached as on{EventName} methods at runtime. */
  reducers?: ReducersMap<State>;
  /** Source handlers; order is enforced by the compiler. */
  sources?: SourceHandlers<State>;
  /** Public read helpers; available as instance.<name>(...). */
  selectors?: SelectorsMap<State>;
  /** Options forwarded to the base aggregate (snapshots/pruning/etc). */
  options?: AggregateOptions;
};

/** Factory wrapper for initial state. */
function asFactory<State>(state: State | (() => State)): () => State {
  return typeof state === 'function' ? (state as () => State) : () => state as State;
}

/** Push (no copy): accepts single value or array. */
function pushTo(arr: any[], ret: any | any[] | void): void {
  if (ret == null) return;
  if (Array.isArray(ret)) {
    arr.push(...ret);
    return;
  }
  arr.push(ret);
}

/**
 * Compiles a declarative model into a zero-args class that extends StateModel<State>.
 * Order: vout (reverse) → vin (reverse) → tx (forward) → block (once).
 * Returns from handlers are appended into ctx.locals.<phase>.
 * Reducers invoked as reducer(this.state, event).
 * Public selectors are exposed as instance methods defined from `selectors`.
 */
export function compileStateModel<State>(
  declarative: DeclarativeModel<State>,
  walker: Walker
): CompiledModelClass<State, Model> {
  const { modelId, state, reducers, selectors, sources, options } = declarative;
  const makeState = asFactory(state);
  const has = (k: keyof NonNullable<typeof sources>) => Boolean(sources && sources[k]);

  class Compiled extends StateModel<State> {
    private static readonly DEFAULT_START_HEIGHT = -1 as const;

    // selectors will be attached on the instance as read-only object
    public readonly selectors!: Record<string, (...args: any[]) => any>;

    constructor() {
      const mergedOptions = { ...(options ?? {}), initialState: makeState };
      super(modelId, Compiled.DEFAULT_START_HEIGHT, mergedOptions);

      // Bind reducers as on{EventName}; call with (this.state, e)
      for (const [eventNameKey, reducer] of Object.entries(reducers ?? {})) {
        const bound = (e: any) => (reducer as any)(this.state, e);
        Object.defineProperty(this, `on${eventNameKey}`, {
          value: bound,
          writable: false,
          enumerable: false,
          configurable: true,
        });
      }

      // Bind selectors as instance.selectors.<name>(...args)
      if (selectors && Object.keys(selectors).length) {
        // const boundSelectors: Record<string, (...args: any[]) => any> = {};
        for (const [name, sel] of Object.entries(selectors ?? {})) {
          Object.defineProperty(this, name, {
            value: (...args: any[]) => (sel as any)(this.state, ...args),
            writable: false,
            enumerable: false,
            configurable: false,
          });
        }

        // for (const [name, sel] of Object.entries(selectors)) {
        //   boundSelectors[name] = (...args: any[]) => (sel as any)(this.state, ...args);
        // }
        // Object.defineProperty(this, 'selectors', {
        //   value: Object.freeze(boundSelectors),
        //   writable: false,
        //   enumerable: true,
        //   configurable: false,
        // });
      }
      // else {
      //   Object.defineProperty(this, 'selectors', {
      //     value: Object.freeze({} as Record<string, (...args: any[]) => any>),
      //     writable: false,
      //     enumerable: true,
      //     configurable: false,
      //   });
      // }
    }

    // precise context type for block phase
    public async processBlock(ctx: ProcessBlockExecutionContext): Promise<void> {
      const block = ctx?.block;
      if (!block) return;

      // Base context: prototype-chain to original ctx (no deep copies)
      const baseCtx = Object.create(ctx);

      // Per-block accumulator; not persisted
      const locals: Locals = { vout: [], vin: [], tx: [] };

      // Inject stable references into baseCtx
      Object.defineProperty(baseCtx, 'state', { value: this.state, writable: false, enumerable: false });
      Object.defineProperty(baseCtx, 'applyEvent', {
        value: this.applyEvent.bind(this),
        writable: false,
        enumerable: false,
      });
      Object.defineProperty(baseCtx, 'locals', { value: locals, writable: false, enumerable: false });

      // 1) vout — reverse
      if (has('vout')) {
        const bag: any[] = [];
        await walker('block.tx.vout', block, (subctx) => {
          bag.push(subctx);
        });
        for (let i = bag.length - 1; i >= 0; i--) {
          const subctx = bag[i] as VoutCtx<State>;
          Object.setPrototypeOf(subctx, baseCtx);
          const ret = await (sources!.vout as any)(subctx);
          pushTo(locals.vout, ret);
        }
      }

      // 2) vin — reverse
      if (has('vin')) {
        const bag: any[] = [];
        await walker('block.tx.vin', block, (subctx) => {
          bag.push(subctx);
        });
        for (let i = bag.length - 1; i >= 0; i--) {
          const subctx = bag[i] as VinCtx<State>;
          Object.setPrototypeOf(subctx, baseCtx);
          const ret = await (sources!.vin as any)(subctx);
          pushTo(locals.vin, ret);
        }
      }

      // 3) tx — forward
      if (has('tx')) {
        await walker('block.tx', block, async (subctx) => {
          const ctxTx = subctx as TxCtx<State>;
          Object.setPrototypeOf(ctxTx, baseCtx);
          const ret = await (sources!.tx as any)(ctxTx);
          pushTo(locals.tx, ret);
        });
      }

      // 4) block — forward (once)
      if (has('block')) {
        const subctx = { block } as BlockCtx<State>;
        Object.setPrototypeOf(subctx, baseCtx);
        await (sources!.block as any)(subctx);
      }
    }

    /**
     * Optional mempool tick.
     *
     * Order per tick:
     *  - walker('mempool', mempool) → sources.mempool(ctx) once (if provided)
     *  - walker('mempool.tx', mempool) → sources.mempoolTx(ctx) for each tx (if provided)
     * Returns from handlers are appended into locals.mempool / locals.mempoolTx respectively.
     * Keep handlers idempotent for the same input tick.
     */
    public async mempoolTick(ctx: MempoolTickExecutionContext): Promise<void> {
      const mempool = ctx?.mempool;
      if (!mempool) return;

      // Base context: prototype-chain to original ctx (no deep copies)
      const baseCtx = Object.create(ctx);

      // Per-tick accumulator for mempool; not persisted
      const locals: Locals = { vout: [], vin: [], tx: [] };

      // Inject stable references into baseCtx
      Object.defineProperty(baseCtx, 'state', { value: this.state, writable: false, enumerable: false });
      Object.defineProperty(baseCtx, 'applyEvent', {
        value: this.applyEvent.bind(this),
        writable: false,
        enumerable: false,
      });
      Object.defineProperty(baseCtx, 'locals', { value: locals, writable: false, enumerable: false });

      // 1) vout — reverse
      if (has('vout')) {
        const bag: any[] = [];
        await walker('mempool.tx.vout', mempool, (subctx) => {
          bag.push(subctx);
        });
        for (let i = bag.length - 1; i >= 0; i--) {
          const subctx = bag[i] as VoutCtx<State>;
          Object.setPrototypeOf(subctx, baseCtx);
          const ret = await (sources!.vout as any)(subctx);
          pushTo(locals.vout, ret);
        }
      }

      // 2) vin — reverse
      if (has('vin')) {
        const bag: any[] = [];
        await walker('mempool.tx.vin', mempool, (subctx) => {
          bag.push(subctx);
        });
        for (let i = bag.length - 1; i >= 0; i--) {
          const subctx = bag[i] as VinCtx<State>;
          Object.setPrototypeOf(subctx, baseCtx);
          const ret = await (sources!.vin as any)(subctx);
          pushTo(locals.vin, ret);
        }
      }

      // 3) tx — forward
      if (has('tx')) {
        await walker('mempool.tx', mempool, async (subctx) => {
          const ctxTx = subctx as MempoolTxCtx<State>;
          Object.setPrototypeOf(ctxTx, baseCtx);
          const ret = await (sources!.tx as any)(ctxTx);
          pushTo(locals.tx, ret);
        });
      }

      // 4) block — forward (once)
      if (has('block')) {
        const subctx = { mempool } as MempoolCtx<State>;
        Object.setPrototypeOf(subctx, baseCtx);
        await (sources!.block as any)(subctx);
      }
    }
  }

  Object.defineProperty(Compiled, 'name', { value: `${modelId}Model` });
  return Compiled as unknown as CompiledModelClass<State, Model>;
}
