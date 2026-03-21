import 'reflect-metadata';
import { NestApplicationContext } from '@nestjs/core/nest-application-context';
import { DependenciesScanner } from '@nestjs/core/scanner';
import { InstanceLoader } from '@nestjs/core/injector/instance-loader';
import { NestContainer } from '@nestjs/core/injector/container';
import { MetadataScanner } from '@nestjs/core/metadata-scanner';
import { GraphInspector } from '@nestjs/core/inspector/graph-inspector';
import { NoopGraphInspector } from '@nestjs/core/inspector/noop-graph-inspector';
import { ApplicationConfig } from '@nestjs/core/application-config';
import { Injector } from '@nestjs/core/injector/injector';
import type { INestApplicationContext } from '@nestjs/common';
import { NestLogger } from '@easylayer/common/logger';
import { CqrsModule } from '@easylayer/common/cqrs';
import type { IQueryHandler, IEventHandler } from '@easylayer/common/cqrs';
import { CommandHandlers } from '../domain-layer/command-handlers';
import { EventsHandlers } from '../domain-layer/events-handlers';
import { QueryHandlers } from '../domain-layer/query-handlers';
import { BrowserAppModule } from './app.module';
import { AppService } from '../app.service';
import { getUnifiedEnv } from '../config/unified-env';
import type { ModelInput, QueryHandlerInput } from '../domain-layer/framework';
import { buildQueryHandlerClass, splitQueryHandlers } from '../domain-layer/framework';

export interface BrowserBootstrapOptions {
  Models?: ModelInput[];
  QueryHandlers?: QueryHandlerInput[];
  EventHandlers?: Array<new (...args: any[]) => IEventHandler>;
  Providers?: any[];
}

export const bootstrapBrowser = async ({
  Models = [],
  QueryHandlers: UserQueryHandlers = [],
  EventHandlers: UserEventHandlers = [],
  Providers = [],
}: BrowserBootstrapOptions = {}): Promise<INestApplicationContext> => {
  const env = getUnifiedEnv();
  const appName = env.APPLICATION_NAME || 'bitcoin';

  const allowedLevels = new Set(['debug', 'info', 'warn', 'error', 'fatal']);
  const envLevel = (env.LOG_LEVEL || '').toLowerCase();
  const loggerLevel = allowedLevels.has(envLevel) ? (envLevel as any) : env.TRACE === '1' ? 'trace' : 'info';

  const { classHandlers, factories } = splitQueryHandlers(UserQueryHandlers);

  const appModule = await BrowserAppModule.forRootAsync({
    appName,
    Models,
    Providers,
  });

  const servicesRef = { value: null as any };

  const cqrsModule = CqrsModule.forRoot({
    isGlobal: true,
    commands: [...CommandHandlers],
    queries: [
      ...QueryHandlers,
      ...classHandlers,
      ...factories.map((f) => buildQueryHandlerClass(f, () => servicesRef.value)),
    ],
    events: [...EventsHandlers, ...UserEventHandlers],
  });

  const rootModule = {
    module: class BrowserRootModule {},
    imports: [appModule, cqrsModule],
    exports: [],
  };

  const applicationConfig = new ApplicationConfig();
  const container = new NestContainer(applicationConfig);
  const graphInspector = NoopGraphInspector;
  const injector = new Injector({ preview: false });
  const metadataScanner = new MetadataScanner();
  const scanner = new DependenciesScanner(container, metadataScanner, graphInspector, applicationConfig);
  const instanceLoader = new InstanceLoader(container, injector, graphInspector);

  await scanner.scan(rootModule as any);
  await instanceLoader.createInstancesOfDependencies();
  scanner.applyApplicationProviders();

  const modules = container.getModules();
  const firstModule = modules.values().next().value;
  const appContext = new NestApplicationContext(container, { abortOnError: false }, firstModule);

  const logger = new NestLogger({ name: appName, level: loggerLevel, enabled: true });
  appContext.useLogger(logger);

  try {
    await appContext.init();

    const appService = appContext.get(AppService, { strict: false });

    const modelFactory = appContext.get('ModelFactoryService', { strict: false });
    servicesRef.value = { modelFactory };

    await appService.init();
    logger.log('Bitcoin crawler started in browser mode', 'Bootstrap');
    return appContext;
  } catch (err) {
    const trace = err instanceof Error ? err.stack : undefined;
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Browser bootstrap failed: ${msg}`, trace, 'Bootstrap');
    throw err;
  }
};
