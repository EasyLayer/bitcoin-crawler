import { Module, DynamicModule } from '@nestjs/common';
import { CqrsModule } from '@easylayer/common/cqrs';
import type { IQueryHandler, IEventHandler } from '@easylayer/common/cqrs';
import { CommandHandlers } from '../domain-layer/command-handlers';
import { EventsHandlers } from '../domain-layer/events-handlers';
import { QueryHandlers } from '../domain-layer/query-handlers';
import type { AppModuleOptions } from './app.module';
import { AppModule } from './app.module';
import {
  type QueryHandlerInput,
  type QueryFactoryServices,
  splitQueryHandlers,
  buildQueryHandlerClass,
} from '../domain-layer/framework';

export interface ContainerModuleOptions extends AppModuleOptions {
  /**
   * User query handlers — classic decorated classes OR factory objects.
   * Factory objects: { queryName: string, handle: async (dto, services) => any }
   * No decorators or emitDecoratorMetadata needed for factory objects.
   */
  QueryHandlers?: QueryHandlerInput[];
  EventHandlers?: Array<new (...args: any[]) => IEventHandler>;
}

@Module({})
export class ContainerModule {
  static async register({
    appName,
    Models,
    Providers,
    config,
    QueryHandlers: UserQueryHandlers = [],
    EventHandlers: UserEventHandlers = [],
  }: ContainerModuleOptions): Promise<DynamicModule> {
    const app = await AppModule.forRootAsync({
      appName,
      Models,
      Providers,
      config,
    });

    const { classHandlers, factories } = splitQueryHandlers(UserQueryHandlers);

    // Mutable services ref — filled after appContext.init() in bootstrap.ts.
    // The getServices getter is called at execute() time, so it's safe to
    // populate it after the DI container is ready.
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
      module: ContainerModule,
      imports: [app, cqrs],
      providers: [
        // Expose the ref so bootstrap.ts can fill it after appContext.init()
        { provide: 'QUERY_FACTORY_SERVICES_REF', useValue: servicesRef },
      ],
      exports: ['QUERY_FACTORY_SERVICES_REF'],
    };
  }
}
