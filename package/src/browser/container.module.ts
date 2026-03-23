import { Module, DynamicModule } from '@nestjs/common';
import { CqrsModule } from '@easylayer/common/cqrs';
import type { IEventHandler } from '@easylayer/common/cqrs';
import { CommandHandlers } from '../domain-layer/command-handlers';
import { EventsHandlers } from '../domain-layer/events-handlers';
import { QueryHandlers } from '../domain-layer/query-handlers';
import type { BrowserAppModuleOptions } from './app.module';
import { BrowserAppModule } from './app.module';
import {
  type QueryHandlerInput,
  type QueryFactoryServices,
  splitQueryHandlers,
  buildQueryHandlerClass,
} from '../domain-layer/framework';

export interface BrowserContainerModuleOptions extends BrowserAppModuleOptions {
  /**
   * User query handlers — classic decorated classes OR factory objects.
   * Factory objects: { queryName: string, handle: async (dto, services) => any }
   * No decorators or emitDecoratorMetadata needed for factory objects.
   */
  QueryHandlers?: QueryHandlerInput[];
  EventHandlers?: Array<new (...args: any[]) => IEventHandler>;
}

@Module({})
export class BrowserContainerModule {
  static async register({
    appName,
    Models,
    Providers,
    QueryHandlers: UserQueryHandlers = [],
    EventHandlers: UserEventHandlers = [],
  }: BrowserContainerModuleOptions): Promise<DynamicModule> {
    const app = await BrowserAppModule.forRootAsync({
      appName,
      Models,
      Providers,
    });

    const { classHandlers, factories } = splitQueryHandlers(UserQueryHandlers);

    // Mutable services ref — filled after appContext.init() in browser/bootstrap.ts.
    const servicesRef: { value?: QueryFactoryServices } = {};
    const getServices = () => {
      if (!servicesRef.value) throw new Error('QueryFactory services not initialized yet');
      return servicesRef.value;
    };

    const factoryHandlerClasses = factories.map((f) => buildQueryHandlerClass(f, getServices));

    const cqrs = CqrsModule.forRoot({
      isGlobal: true,
      commands: [...CommandHandlers],
      queries: [...QueryHandlers, ...classHandlers, ...factoryHandlerClasses],
      events: [...EventsHandlers, ...UserEventHandlers],
    });

    return {
      module: BrowserContainerModule,
      imports: [app, cqrs],
      providers: [
        // Expose the ref so browser/bootstrap.ts can fill it after appContext.init()
        { provide: 'QUERY_FACTORY_SERVICES_REF', useValue: servicesRef },
      ],
      exports: ['QUERY_FACTORY_SERVICES_REF'],
    };
  }
}
