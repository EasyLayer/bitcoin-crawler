import 'reflect-metadata';
import 'dotenv/config';
import '../utils'; // check-node-version (Node only)
import { NestFactory } from '@nestjs/core';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestLogger } from '@easylayer/common/logger';
import { ContainerModule } from './container.module';
import type { ContainerModuleOptions } from './container.module';
import { setupTestEventSubscribers, type TestingOptions } from '../utils';
import { AppService } from '../app.service';
import { ModelFactoryService } from '../domain-layer/framework';

type BootstrapOptions = Omit<ContainerModuleOptions, 'appName'> & { testing?: TestingOptions };

export const bootstrap = async ({
  Models,
  QueryHandlers,
  EventHandlers,
  Providers,
  testing = {},
  config = {},
}: BootstrapOptions): Promise<INestApplicationContext | INestApplication> => {
  const appName = process.env.APPLICATION_NAME || 'bitcoin';
  const isTest = process.env.NODE_ENV === 'test';

  const allowedLevels = new Set(['debug', 'info', 'warn', 'error', 'fatal']);
  const envLevel = (process.env.LOG_LEVEL || '').toLowerCase();
  const loggerLevel = allowedLevels.has(envLevel) ? (envLevel as any) : process.env.TRACE === '1' ? 'trace' : 'info';

  const commonFactoryOpts = {
    bufferLogs: true,
    abortOnError: false,
  };

  const rootModule = await ContainerModule.register({
    Models,
    QueryHandlers,
    EventHandlers,
    Providers,
    appName,
    config,
  });

  const appContext: INestApplicationContext = await NestFactory.createApplicationContext(rootModule, commonFactoryOpts);

  const logger = new NestLogger({
    name: appName,
    level: loggerLevel,
    enabled: true,
  });

  appContext.useLogger(logger);

  try {
    if (!isTest) {
      setupGracefulShutdownHandlers(appContext, logger);
    }

    let testPromises: Promise<void>[] = [];
    if (isTest) {
      testPromises = setupTestEventSubscribers(appContext, testing);
    }

    await appContext.init();

    // After init, the DI container has all services. Populate the services ref
    // so that factory query handlers can access ModelFactoryService at execute() time.
    const servicesRef = appContext.get<{ value?: any }>('QUERY_FACTORY_SERVICES_REF', {
      strict: false,
    });
    if (servicesRef) {
      const modelFactory = appContext.get(ModelFactoryService, { strict: false });
      servicesRef.value = { modelFactory };
    }

    const appService = appContext.get(AppService, { strict: false });
    await appService.init();

    if (testPromises.length > 0) {
      await Promise.all(testPromises);
      await appContext.close();
      return appContext;
    }

    if (isTest) return appContext;

    return appContext;
  } catch (err) {
    const trace = err instanceof Error ? err.stack : undefined;
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Bootstrap failed: ${msg}`, trace, 'Bootstrap');
    if (isTest) throw err;
    process.exit(1);
  }
};

function setupGracefulShutdownHandlers(app: INestApplicationContext, logger: NestLogger) {
  process.on('SIGINT', () => gracefulShutdown(app, logger));
  process.on('SIGTERM', () => gracefulShutdown(app, logger));
}

async function gracefulShutdown(app: INestApplicationContext, logger: NestLogger) {
  logger.log('Graceful shutdown initiated...');
  setTimeout(async () => {
    try {
      logger.log('Closing application...');
      await app.close();
      logger.log('Application closed successfully.');
      process.exit(0);
    } catch (error) {
      const trace = error instanceof Error ? error.stack : undefined;
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Error during shutdown: ${msg}`, trace);
      process.exit(1);
    }
  }, 0);
}
