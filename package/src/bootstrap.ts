import 'reflect-metadata';
import 'dotenv/config';
import './utils';
import { NestFactory } from '@nestjs/core';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestLogger } from '@easylayer/common/logger';
import { ContainerModule } from './container.module';
import type { ContainerModuleOptions } from './container.module';
import { setupTestEventSubscribers, type TestingOptions } from './utils';

type BootstrapOptions = Omit<ContainerModuleOptions, 'appName'> & { testing?: TestingOptions };

export const bootstrap = async ({
  Models,
  QueryHandlers,
  EventHandlers,
  Providers,
  testing = {},
}: BootstrapOptions): Promise<INestApplicationContext | INestApplication> => {
  const appName = process.env.APPLICATION_NAME || 'bitcoin';
  const httpPort = Number(process.env.HTTP_PORT ?? '0');
  const wsPort = Number(process.env.WS_PORT ?? '0');
  const hasNetworkTransports = httpPort > 0 || wsPort > 0;
  const isTest = process.env.NODE_ENV === 'test';
  const loggerLevel = isTest ? 'error' : process.env.DEBUG === '1' ? 'debug' : (process.env.LOG_LEVEL as any) || 'info';

  const rootModule = await ContainerModule.register({
    Models,
    QueryHandlers,
    EventHandlers,
    Providers,
    appName,
  });

  let appContext: INestApplicationContext | INestApplication;
  if (!hasNetworkTransports) {
    appContext = await NestFactory.createApplicationContext(rootModule, { bufferLogs: true, logger: ['error'] as any });
  } else {
    appContext = await NestFactory.create(rootModule, { bufferLogs: true, logger: ['error'] as any });
  }

  const logger = new NestLogger({ name: appName, level: loggerLevel });
  appContext.useLogger(logger);
  (appContext as any).flushLogs?.();

  try {
    if (!isTest) {
      setupGracefulShutdownHandlers(appContext, logger);
    }

    let testPromises: Promise<void>[] = [];
    if (isTest) {
      testPromises = setupTestEventSubscribers(appContext, testing);
    }

    await appContext.init();

    if (testPromises.length > 0) {
      await Promise.all(testPromises);
      await appContext.close();
      return appContext;
    }

    if (isTest) return appContext;

    logger.log('Application bootstrap completed');
    return appContext;
  } catch (err) {
    const trace = err instanceof Error ? err.stack : undefined;
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Bootstrap failed: ${msg}`, trace, 'Bootstrap');
    if (isTest) throw err;
    process.exit(1);
  }
};

/**
 * Sets up graceful shutdown on SIGINT and SIGTERM.
 */
function setupGracefulShutdownHandlers(app: INestApplicationContext, logger: NestLogger) {
  process.on('SIGINT', () => gracefulShutdown(app, logger));
  process.on('SIGTERM', () => gracefulShutdown(app, logger));
}

/**
 * Performs graceful shutdown of the application.
 */
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
