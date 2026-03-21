import { QueryHandler, IQueryHandler } from '@easylayer/common/cqrs';
import type { ModelFactoryService } from '.';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Services available to every query factory function.
 * Passed as the second argument to `handle(dto, services)`.
 */
export interface QueryFactoryServices {
  /** Restore any user model from the EventStore by its constructor. */
  modelFactory: ModelFactoryService;
}

/**
 * Factory-style query definition — no decorators, no DI classes required.
 *
 * Usage:
 *   bootstrap({
 *     Models: [AddressUtxoWatcher],
 *     QueryHandlers: [
 *       {
 *         queryName: 'GetBalanceQuery',
 *         handle: async (dto, { modelFactory }) => {
 *           const model = await modelFactory.restoreByCtor(AddressUtxoWatcher);
 *           return model.getAllBalances();
 *         },
 *       },
 *     ],
 *   });
 */
export interface QueryHandlerFactory<TDto = any, TResult = any> {
  queryName: string;
  handle: (dto: TDto, services: QueryFactoryServices) => Promise<TResult>;
}

/** Either a classic decorated class or a factory object. */
export type QueryHandlerInput = (new (...args: any[]) => IQueryHandler) | QueryHandlerFactory;

// ── Internal adapter ──────────────────────────────────────────────────────────

/**
 * Convert a QueryHandlerFactory into a NestJS QueryHandler class.
 *
 * Uses a `getServices` getter that is called at execute() time — after the
 * NestJS app context is fully initialized. This avoids the chicken-and-egg
 * problem of needing ModelFactoryService before the DI container is ready.
 *
 * esbuild-safe: no emitDecoratorMetadata needed for user code.
 * The @QueryHandler decorator on the generated class works because NestJS
 * registers it in Reflect metadata at class-definition time (here, at module
 * load time) before execute() is ever called.
 */
export function buildQueryHandlerClass(
  factory: QueryHandlerFactory,
  getServices: () => QueryFactoryServices
): new () => IQueryHandler {
  // Create a plain query class whose constructor.name matches queryName.
  // QueryBus uses the name to route to the correct handler.
  const QueryClass = class {};
  Object.defineProperty(QueryClass, 'name', {
    value: factory.queryName,
    configurable: true,
  });

  // Create the handler class with @QueryHandler decorator.
  // modelFactoryService is NOT injected via DI — it's fetched via getServices()
  // closure at execute() time, so emitDecoratorMetadata is not needed.
  @QueryHandler(QueryClass as any)
  class FactoryQueryHandler implements IQueryHandler {
    async execute(query: any): Promise<any> {
      return factory.handle(query, getServices());
    }
  }

  Object.defineProperty(FactoryQueryHandler, 'name', {
    value: `${factory.queryName}FactoryHandler`,
    configurable: true,
  });

  return FactoryQueryHandler;
}

/**
 * Split a mixed QueryHandlerInput[] into classic classes and factory objects.
 */
export function splitQueryHandlers(handlers: QueryHandlerInput[]): {
  classHandlers: Array<new (...args: any[]) => IQueryHandler>;
  factories: QueryHandlerFactory[];
} {
  const classHandlers: Array<new (...args: any[]) => IQueryHandler> = [];
  const factories: QueryHandlerFactory[] = [];

  for (const h of handlers) {
    if (typeof h === 'function') {
      classHandlers.push(h as new (...args: any[]) => IQueryHandler);
    } else {
      factories.push(h as QueryHandlerFactory);
    }
  }

  return { classHandlers, factories };
}
