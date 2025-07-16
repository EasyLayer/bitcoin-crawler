import 'reflect-metadata';
import './utils/check-node-version';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import { NestFactory } from '@nestjs/core';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestLogger, AppLogger } from '@easylayer/common/logger';
import type { CustomEventBus, IQueryHandler, IEventHandler } from '@easylayer/common/cqrs';
import { CqrsModule } from '@easylayer/common/cqrs';
import { AppModule } from './app.module';
import type { ModelType } from './framework';

interface BootstrapOptions {
  Models: ModelType[];
  QueryHandlers?: Array<new (...args: any[]) => IQueryHandler>;
  EventHandlers?: Array<new (...args: any[]) => IEventHandler>;
  testing?: TestingOptions;
}

export interface TestingOptions {
  handlerEventsToWait?: EventWaiter[];
  sagaEventsToWait?: EventWaiter[];
}

interface EventWaiter<T = any> {
  eventType: new (...args: any[]) => T;
  count: number;
}

export const bootstrap = async ({
  Models,
  QueryHandlers,
  EventHandlers,
  testing = {},
}: BootstrapOptions): Promise<INestApplicationContext | INestApplication> => {
  // Load environment variables globally
  config({ path: resolve(process.cwd(), '.env') });

  const logger = new NestLogger();

  try {
    // Register root application module with transport configurations
    const rootModule = await AppModule.register({ Models, QueryHandlers, EventHandlers });

    let appContext: INestApplicationContext | INestApplication;
    const httpPort = Number(process.env.HTTP_PORT ?? '0');
    const wsPort = Number(process.env.WS_PORT ?? '0');
    const hasNetworkTransports = httpPort > 0 || wsPort > 0;
    const isTest = process?.env?.NODE_ENV === 'test';

    if (!hasNetworkTransports) {
      appContext = await NestFactory.createApplicationContext(rootModule, { logger });
    } else {
      appContext = await NestFactory.create(rootModule, { logger });
    }

    // Get logger and config from context
    const customLogger = appContext.get(AppLogger);

    // Setup graceful shutdown handlers only in non-test mode
    if (!isTest) {
      setupGracefulShutdownHandlers(appContext, customLogger);
    }

    // Prepare test event subscribers if running in TEST mode
    let testPromises: Promise<void>[] = [];
    if (isTest) {
      testPromises = setupTestEventSubscribers(appContext, testing);
    }

    // Initialize the application
    await appContext.init();

    // If test subscribers exist, wait for events and then close
    if (testPromises.length > 0) {
      await Promise.all(testPromises);
      await appContext.close();
      return appContext;
    }

    // Return context for test mode or keep running for production
    if (isTest) {
      return appContext;
    }

    // Application is running, transport modules have started their servers
    customLogger.info('Application bootstrap completed');

    // In production mode, keep the process running
    return appContext;
  } catch (err) {
    logger.error(`Bootstrap failed: ${err}`, '', 'Bootstrap');
    process.exit(1);
  }
};

/**
 * Sets up graceful shutdown on SIGINT and SIGTERM.
 */
function setupGracefulShutdownHandlers(app: INestApplicationContext, logger: AppLogger) {
  process.on('SIGINT', () => gracefulShutdown(app, logger));
  process.on('SIGTERM', () => gracefulShutdown(app, logger));
}

/**
 * Performs graceful shutdown of the application.
 */
async function gracefulShutdown(app: INestApplicationContext, logger: AppLogger) {
  logger.info('Graceful shutdown initiated...');
  setTimeout(async () => {
    try {
      logger.info('Closing application...');
      await app.close();
      logger.info('Application closed successfully.');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { args: { error } });
      process.exit(1);
    }
  }, 0);
}

/**
 * Prepares Promises that resolve when specified events are processed by handlers or sagas.
 */
function setupTestEventSubscribers(app: INestApplicationContext, testing: TestingOptions): Promise<void>[] {
  const cqrs: any = app.get(CqrsModule);
  const eventBus = cqrs.eventBus as CustomEventBus;

  const promises: Promise<void>[] = [];

  if (testing.handlerEventsToWait?.length) {
    promises.push(...createCompletionPromises(eventBus.eventHandlerCompletion$, testing.handlerEventsToWait));
  }

  if (testing.sagaEventsToWait?.length) {
    promises.push(...createCompletionPromises(eventBus.sagaCompletion$, testing.sagaEventsToWait));
  }

  return promises;
}

/**
 * Creates an array of Promises for event completion based on waiters.
 */
function createCompletionPromises<E>(stream$: Observable<E>, waiters?: EventWaiter<E>[]): Promise<void>[] {
  return waiters?.filter((w) => w.count > 0).map((w) => createCompletionPromise(stream$, w.eventType, w.count)) || [];
}

/**
 * Returns a Promise that resolves after the specified number of events of given class are emitted.
 */
function createCompletionPromise<E>(
  stream$: Observable<E>,
  EventClass: new (...args: any[]) => E,
  expectedCount: number
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let seen = 0;
    const sub = stream$.pipe(filter((ev) => ev instanceof EventClass)).subscribe({
      next: () => {
        seen += 1;
        if (seen >= expectedCount) {
          sub.unsubscribe();
          resolve();
        }
      },
      error: (err) => {
        sub.unsubscribe();
        reject(err);
      },
    });
  });
}
