import { Module, DynamicModule } from '@nestjs/common';
import { CqrsModule } from '@easylayer/common/cqrs';
import type { IQueryHandler, IEventHandler } from '@easylayer/common/cqrs';
import { CommandHandlers } from './domain-layer/command-handlers';
import { EventsHandlers } from './domain-layer/events-handlers';
import { QueryHandlers } from './domain-layer/query-handlers';
import type { AppModuleOptions } from './app.module';
import { AppModule } from './app.module';

export interface ContainerModuleOptions extends AppModuleOptions {
  QueryHandlers?: Array<new (...args: any[]) => IQueryHandler>;
  EventHandlers?: Array<new (...args: any[]) => IEventHandler>;
}

@Module({})
export class ContainerModule {
  static async register({
    appName,
    Models,
    Providers,
    QueryHandlers: UserQueryHandlers = [],
    EventHandlers: UserEventHandlers = [],
  }: ContainerModuleOptions): Promise<DynamicModule> {
    const app = await AppModule.forRootAsync({
      appName,
      Models: Models,
      Providers: Providers,
    });

    const cqrs = CqrsModule.forRoot({
      isGlobal: true,
      commands: [...CommandHandlers],
      queries: [...QueryHandlers, ...UserQueryHandlers],
      events: [...EventsHandlers, ...UserEventHandlers],
      sagas: [],
    });

    return {
      module: ContainerModule,
      imports: [app, cqrs],
      exports: [],
    };
  }
}
